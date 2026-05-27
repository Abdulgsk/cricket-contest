import { connectDB } from "@/lib/db";
import type mongoose from "mongoose";
import { Match } from "@/models/Match";
import { Player } from "@/models/Player";
import { UserMatchTeam, type IUserMatchTeam, type IUserMatchTeamPlayer } from "@/models/UserMatchTeam";
import { User } from "@/models/User";
import { getSettings } from "@/models/Settings";
import {
  fetchLeaderboardFromContestUrl,
  getUserTeamDetails,
  My11AuthError,
  My11NotReadyError,
  type My11LeaderboardResult,
} from "@/lib/my11-api";
import { normalizeMy11circleName } from "@/lib/my11circle";

/**
 * Resolve the contest match the Contests tab should show.
 * Priority: live (with contestUrl) → most recent completed (with contestUrl)
 * → next upcoming (with contestUrl).
 */
export async function resolveCurrentContestMatch() {
  await connectDB();
  const live = await Match.findOne({
    status: "live",
    contestUrl: { $exists: true, $ne: "" },
  })
    .sort({ startTime: -1 })
    .lean();
  if (live) return live;

  const completed = await Match.findOne({
    status: "completed",
    contestUrl: { $exists: true, $ne: "" },
  })
    .sort({ startTime: -1 })
    .lean();
  if (completed) return completed;

  const upcoming = await Match.findOne({
    status: "upcoming",
    contestUrl: { $exists: true, $ne: "" },
  })
    .sort({ startTime: 1 })
    .lean();
  return upcoming ?? null;
}

// Module-level cache so concurrent client polls don't hammer my11.
const lbCache = new Map<string, { at: number; data: My11LeaderboardResult }>();
const teamCache = new Map<string, { at: number; data: IUserMatchTeam }>();

/**
 * Re-derive each player's `isCaptain` / `isViceCaptain` from the team's
 * authoritative `captainIds` / `viceCaptainIds`. This protects us from
 * historical DB rows where those flags were polluted by the on-field
 * match-captain/keeper booleans from My11.
 */
/**
 * Side-effect: upsert each player observed in a freshly-fetched my11 team
 * into the master Player directory. Keyed by my11's numeric `id` so impact-
 * player swaps that arrive in subsequent refreshes simply create / touch
 * their own Player doc — no migration required. Failures are swallowed: the
 * directory is best-effort, the team data is what matters.
 */
async function upsertPlayers(
  players: IUserMatchTeamPlayer[],
  matchObjectId: mongoose.Types.ObjectId
): Promise<void> {
  if (!players?.length) return;
  try {
    const settings = await getSettings();
    if (settings.playerDirectoryEnabled === false) return;
  } catch {
    // If settings can't be read, default to "enabled" — the directory is
    // best-effort and the cost of a no-op upsert is negligible.
  }
  const now = new Date();
  try {
    const ops = players.map((p) => ({
      updateOne: {
        filter: { my11Id: p.id },
        update: {
          $set: {
            name: p.name,
            dName: p.dName ?? p.name,
            sName: p.sName,
            role: p.role,
            roleName: p.roleName,
            roleSubType: p.roleSubType,
            teamId: p.teamId ?? null,
            teamName: p.teamName,
            imgURL: p.imgURL,
            lastSeenAt: now,
            lastMatchId: matchObjectId,
          },
          $setOnInsert: {
            my11Id: p.id,
            firstSeenAt: now,
          },
        },
        upsert: true,
      },
    }));
    await Player.bulkWrite(ops, { ordered: false });
  } catch {
    // Directory is best-effort; team persistence already succeeded.
  }
}

export function normalizeTeamFlags(team: IUserMatchTeam): IUserMatchTeam {
  const cap = new Set<number>(team.captainIds ?? []);
  const vc = new Set<number>(team.viceCaptainIds ?? []);
  return {
    ...team,
    players: (team.players ?? []).map((p) => ({
      ...p,
      isCaptain: cap.has(p.id),
      isViceCaptain: vc.has(p.id),
      isWicketKeeper: false,
    })),
  };
}

export async function getCachedLeaderboard(contestUrl: string, ttlMs: number) {
  const hit = lbCache.get(contestUrl);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return { data: hit.data, fetchedAt: hit.at, cached: true };
  try {
    const data = await fetchLeaderboardFromContestUrl(contestUrl);
    lbCache.set(contestUrl, { at: now, data });
    return { data, fetchedAt: now, cached: false };
  } catch (err) {
    if (err instanceof My11AuthError) return { error: "auth_expired" as const };
    if (err instanceof My11NotReadyError) return { error: "not_ready" as const };
    if (hit) return { data: hit.data, fetchedAt: hit.at, cached: true, stale: true };
    return { error: "fetch_failed" as const };
  }
}

/**
 * Get a cached/refreshed UserMatchTeam doc. Auto-refreshes from My11 when
 * stale, leveraging both the in-process cache and the existing DB row.
 */
export async function getRefreshedUserMatchTeam(args: {
  matchId: string;
  userId: string;
  ttlMs: number;
  matchStatus: "upcoming" | "live" | "completed";
  contestUrl: string;
}): Promise<
  | { ok: true; team: IUserMatchTeam; fetchedAt: number; cached: boolean }
  | { ok: false; error: string }
> {
  const { matchId, userId, ttlMs, matchStatus, contestUrl } = args;
  const cacheKey = `${matchId}:${userId}`;
  const now = Date.now();

  await connectDB();
  const existing = await UserMatchTeam.findOne({ matchId, userId }).lean();
  if (!existing) {
    return { ok: false, error: "team_not_mapped" };
  }

  // For finished matches we never refresh — score is final.
  if (matchStatus === "completed") {
    return {
      ok: true,
      team: normalizeTeamFlags(existing),
      fetchedAt: existing.fetchedAt ? new Date(existing.fetchedAt).getTime() : now,
      cached: true,
    };
  }

  const fetchedAt = existing.fetchedAt ? new Date(existing.fetchedAt).getTime() : 0;
  const fresh = now - fetchedAt < ttlMs;
  const cacheHit = teamCache.get(cacheKey);
  if (fresh || (cacheHit && now - cacheHit.at < ttlMs)) {
    return { ok: true, team: normalizeTeamFlags(existing), fetchedAt, cached: true };
  }

  // Need refresh from my11. We need the my11 ids — they live on the existing doc.
  try {
    const detail = await getUserTeamDetails({
      matchId: existing.my11MatchId,
      contestId: existing.my11ContestId,
      teamId: existing.my11UserTeamId,
    });
    const updated = await UserMatchTeam.findOneAndUpdate(
      { matchId, userId },
      {
        $set: {
          rank: detail.rank,
          score: detail.score,
          captainName: detail.captainName,
          viceCaptainName: detail.viceCaptainName,
          captainIds: detail.captainIds,
          viceCaptainIds: detail.viceCaptainIds,
          players: detail.players,
          fetchedAt: new Date(now),
          sourceUpdatedAt: detail.updatedAt ? new Date(detail.updatedAt) : null,
        },
      },
      { new: true }
    ).lean();
    if (updated) {
      teamCache.set(cacheKey, { at: now, data: updated });
      // Best-effort side-effect: keep the master Player directory current.
      void upsertPlayers(detail.players, updated.matchId);
      return { ok: true, team: normalizeTeamFlags(updated), fetchedAt: now, cached: false };
    }
    return { ok: true, team: normalizeTeamFlags(existing), fetchedAt, cached: true };
  } catch (err) {
    if (err instanceof My11AuthError) return { ok: false, error: "auth_expired" };
    if (err instanceof My11NotReadyError) return { ok: false, error: "not_ready" };
    // Soft fallback: serve last known data.
    return { ok: true, team: normalizeTeamFlags(existing), fetchedAt, cached: true };
  }
}

/**
 * List all app users with a stored team for this match.
 * Used to power the Compare picker and the "Positions" card.
 *
 * If `live` is provided, current scores are merged in from the contest
 * leaderboard (matched by normalised my11 username). Without this, holders
 * would carry the last-fetched `UserMatchTeam.score` for everyone except the
 * viewing user — making other players' points look stale or wrong.
 *
 * Returns holders sorted by current `score` DESC (so positions reflect the
 * latest fantasy points within our friend group, even if my11's overall
 * `rank` field is stale). A `localRank` 1..n is computed with standard
 * competition ranking (ties share the lower rank, next rank skips).
 */
export async function listMatchTeamHolders(
  matchId: string,
  live?: { contestUrl: string; ttlMs: number },
) {
  await connectDB();
  const teams = await UserMatchTeam.find({ matchId })
    .select("userId rank score my11Username")
    .lean();
  const userIds = teams.map((t) => t.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("username userId avatar avatarColor")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Build a live-score lookup keyed by normalised my11 username.
  const liveByName = new Map<string, { score: number; rank: number | null }>();
  if (live?.contestUrl) {
    const lb = await getCachedLeaderboard(live.contestUrl, live.ttlMs);
    if (lb && "data" in lb && lb.data) {
      for (const e of lb.data.entries) {
        const key = normalizeMy11circleName(e.username);
        if (!key) continue;
        const prev = liveByName.get(key);
        // my11 returns one row per team; keep the highest score so multi-team
        // players show their best.
        if (!prev || e.totalScore > prev.score) {
          liveByName.set(key, { score: e.totalScore, rank: e.rank });
        }
      }
    }
  }

  const rows = teams
    .map((t) => {
      const u = userMap.get(String(t.userId));
      if (!u) return null;
      const key = t.my11Username ? normalizeMy11circleName(t.my11Username) : "";
      const liveHit = key ? liveByName.get(key) : undefined;
      return {
        userId: String(t.userId),
        username: u.username,
        handle: u.userId,
        avatar: u.avatar ?? null,
        avatarColor: u.avatarColor ?? null,
        // Prefer live values when available; fall back to last-stored.
        rank: liveHit?.rank ?? t.rank ?? null,
        score: liveHit?.score ?? t.score ?? null,
        my11Username: t.my11Username,
        localRank: 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => {
      const sa = a.score ?? Number.NEGATIVE_INFINITY;
      const sb = b.score ?? Number.NEGATIVE_INFINITY;
      if (sa !== sb) return sb - sa;
      const ra = a.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.rank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.username.localeCompare(b.username);
    });

  let lastScore: number | null = null;
  let lastLocalRank = 0;
  rows.forEach((r, i) => {
    if (r.score == null) {
      r.localRank = 0;
      return;
    }
    const rank = lastScore !== null && r.score === lastScore ? lastLocalRank : i + 1;
    r.localRank = rank;
    lastScore = r.score;
    lastLocalRank = rank;
  });
  return rows;
}

export async function getMy11LiveRefreshMs() {
  const settings = await getSettings();
  const sec = settings.my11LiveRefreshSec ?? 30;
  return Math.max(5, Math.min(600, sec)) * 1000;
}

export { normalizeMy11circleName };
