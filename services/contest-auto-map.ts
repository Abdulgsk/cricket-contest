/**
 * Auto-maps a (just-started) match to its my11 contest so that the Contests
 * page and Civil War can render live data without any admin action.
 *
 * Steps performed (idempotent):
 *  1. If Match.contestUrl is missing, ask my11 for all matches and pick the
 *     LIVE one whose two teams match this app match. Pick the first contest
 *     of that match (we filter IPL upstream, so there's usually only one
 *     league contest joined). Persist `Match.contestUrl`.
 *  2. Fetch the leaderboard to learn each player's `teamId`.
 *  3. For every app user who is in this match's leaderboard, upsert their
 *     `UserMatchTeam` with full team details (captain, players, score).
 *
 * Success criteria — sets `Match.autoMapDone = true` so future cron runs skip:
 *   - contestUrl present
 *   - leaderboard fetched at least once
 *   - every my11-mapped app user either upserted successfully OR is not in the
 *     leaderboard (i.e. didn't join the contest — we won't keep retrying for
 *     non-joiners; they made their choice)
 *
 * Transient failures (my11 auth/not-ready/network) leave autoMapDone=false so
 * the next cron tick retries. We cap retries at 12 (≈ one match window) before
 * forcibly marking the match as done.
 */
import { connectDB } from "@/lib/db";
import { Match, type IMatch } from "@/models/Match";
import { User } from "@/models/User";
import { UserMatchTeam } from "@/models/UserMatchTeam";
import type { HydratedDocument } from "mongoose";
import {
  listAllMatches,
  listMyContests,
  getLeaderboard,
  getUserTeamDetails,
  My11AuthError,
  My11NotReadyError,
} from "@/lib/my11-api";
import { normalizeMy11circleName } from "@/lib/my11circle";

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function teamMatchesAny(appTeam: string, my11A: string, my11B: string): boolean {
  const a = tokens(appTeam);
  const m = new Set([...tokens(my11A), ...tokens(my11B), my11A.toLowerCase(), my11B.toLowerCase()]);
  return a.some((tok) => Array.from(m).some((mt) => mt.includes(tok) || tok.includes(mt)));
}

function parseContestUrl(url: string): { matchId: number; contestId: number } | null {
  const m = url.match(/leaderboard\/(\d+)\/(\d+)/);
  if (!m) return null;
  return { matchId: Number(m[1]), contestId: Number(m[2]) };
}

const MAX_ATTEMPTS = 12;

type AutoMapResult =
  | { ok: true; matchId: string; mapped: number; notJoined: number; failed: number; done: boolean; skipped?: boolean }
  | { ok: false; matchId: string; error: string; retryable: boolean };

export async function autoMapMatch(matchId: string): Promise<AutoMapResult> {
  await connectDB();
  const m = await Match.findById(matchId);
  if (!m) return { ok: false, matchId, error: "match_not_found", retryable: false };
  if (m.autoMapDone) return { ok: true, matchId, mapped: 0, notJoined: 0, failed: 0, done: true, skipped: true };

  // -- Step 1: ensure contestUrl --
  let my11MatchId: number | null = null;
  let my11ContestId: number | null = null;
  if (m.contestUrl) {
    const parsed = parseContestUrl(m.contestUrl);
    if (parsed) {
      my11MatchId = parsed.matchId;
      my11ContestId = parsed.contestId;
    }
  }
  if (my11MatchId == null || my11ContestId == null) {
    try {
      const all = await listAllMatches();
      // status: 1=upcoming, 2=live, 3=completed. Prefer LIVE matching teams.
      const matchesTeams = all.filter(
        (mm) =>
          teamMatchesAny(m.teamA, mm.team1, mm.team2) &&
          teamMatchesAny(m.teamB, mm.team1, mm.team2),
      );
      const live = matchesTeams.find((c) => c.status === 2) ?? matchesTeams[0] ?? null;
      if (!live) {
        await recordAttempt(m, "no_my11_match");
        return { ok: false, matchId, error: "no_my11_match", retryable: true };
      }
      my11MatchId = live.matchId;
      const contests = await listMyContests(my11MatchId);
      if (!contests.length) {
        await recordAttempt(m, "no_contests_joined");
        return { ok: false, matchId, error: "no_contests_joined", retryable: true };
      }
      my11ContestId = contests[0].contestId;
      m.contestUrl = `https://www.my11circle.com/lobby/contests/leaderboard/${my11MatchId}/${my11ContestId}`;
      await m.save();
    } catch (e) {
      if (e instanceof My11AuthError) {
        await recordAttempt(m, "auth_expired");
        return { ok: false, matchId, error: "auth_expired", retryable: true };
      }
      if (e instanceof My11NotReadyError) {
        await recordAttempt(m, "not_ready");
        return { ok: false, matchId, error: "not_ready", retryable: true };
      }
      await recordAttempt(m, (e as Error).message);
      return { ok: false, matchId, error: (e as Error).message, retryable: true };
    }
  }

  // -- Step 2: leaderboard --
  let leaderboard;
  try {
    leaderboard = await getLeaderboard(my11MatchId, my11ContestId);
  } catch (e) {
    if (e instanceof My11AuthError) {
      await recordAttempt(m, "auth_expired");
      return { ok: false, matchId, error: "auth_expired", retryable: true };
    }
    if (e instanceof My11NotReadyError) {
      await recordAttempt(m, "not_ready");
      return { ok: false, matchId, error: "not_ready", retryable: true };
    }
    await recordAttempt(m, (e as Error).message);
    return { ok: false, matchId, error: (e as Error).message, retryable: true };
  }

  const teamIdByName = new Map<string, { teamId: number; username: string }>();
  for (const row of leaderboard.entries) {
    if (row.teamId == null) continue;
    teamIdByName.set(normalizeMy11circleName(row.username), {
      teamId: row.teamId,
      username: row.username,
    });
  }

  // -- Step 3: per-user team details --
  const users = await User.find({ my11circleName: { $exists: true, $ne: "" } })
    .select("username userId my11circleName")
    .lean();

  let mapped = 0;
  let notJoined = 0;
  let failed = 0;

  for (const u of users) {
    // If we already have a team for this (match,user), skip.
    const existing = await UserMatchTeam.findOne({ matchId: m._id, userId: u._id })
      .select("_id")
      .lean();
    if (existing) {
      mapped++;
      continue;
    }
    const key = normalizeMy11circleName(u.my11circleName ?? "");
    const hit = teamIdByName.get(key);
    if (!hit) {
      notJoined++;
      continue;
    }
    try {
      const detail = await getUserTeamDetails({
        matchId: my11MatchId,
        contestId: my11ContestId,
        teamId: hit.teamId,
      });
      await UserMatchTeam.updateOne(
        { matchId: m._id, userId: u._id },
        {
          $set: {
            matchId: m._id,
            userId: u._id,
            my11MatchId,
            my11ContestId,
            my11UserTeamId: detail.userTeamId,
            my11Username: detail.uName || hit.username,
            userTeamName: detail.userTeamName,
            rank: detail.rank,
            score: detail.score,
            captainName: detail.captainName,
            viceCaptainName: detail.viceCaptainName,
            captainIds: detail.captainIds,
            viceCaptainIds: detail.viceCaptainIds,
            players: detail.players,
            fetchedAt: new Date(),
            sourceUpdatedAt: detail.updatedAt ? new Date(detail.updatedAt) : null,
          },
        },
        { upsert: true },
      );
      mapped++;
    } catch (e) {
      if (e instanceof My11AuthError) {
        await recordAttempt(m, "auth_expired");
        return { ok: false, matchId, error: "auth_expired", retryable: true };
      }
      failed++;
    }
  }

  m.autoMapAttempts = (m.autoMapAttempts ?? 0) + 1;
  m.lastAutoMapAt = new Date();
  // Done when no transient per-user failures AND we've seen at least one
  // mapped team. notJoined users are accepted — they didn't join the contest.
  if (failed === 0 && mapped > 0) {
    m.autoMapDone = true;
    m.autoMapLastError = null;
  } else if ((m.autoMapAttempts ?? 0) >= MAX_ATTEMPTS) {
    m.autoMapDone = true;
    m.autoMapLastError = `gave_up_after_${m.autoMapAttempts}_attempts`;
  } else {
    m.autoMapLastError = failed > 0 ? `${failed}_user_fetch_failures` : null;
  }
  await m.save();

  return {
    ok: true,
    matchId,
    mapped,
    notJoined,
    failed,
    done: !!m.autoMapDone,
  };
}

async function recordAttempt(m: HydratedDocument<IMatch>, error: string) {
  m.autoMapAttempts = (m.autoMapAttempts ?? 0) + 1;
  m.lastAutoMapAt = new Date();
  m.autoMapLastError = error;
  if ((m.autoMapAttempts ?? 0) >= MAX_ATTEMPTS) {
    m.autoMapDone = true;
  }
  await m.save();
}

/** Cron entry: scan live matches and run autoMapMatch on each that's not done. */
export async function autoMapAllLiveMatches(limit = 4) {
  await connectDB();
  const live = await Match.find({
    status: "live",
    autoMapDone: { $ne: true },
  })
    .sort({ startTime: -1 })
    .limit(limit)
    .select("_id")
    .lean();
  const results: AutoMapResult[] = [];
  for (const row of live) {
    try {
      results.push(await autoMapMatch(String(row._id)));
    } catch (e) {
      results.push({
        ok: false,
        matchId: String(row._id),
        error: (e as Error).message,
        retryable: true,
      });
    }
  }
  return results;
}
