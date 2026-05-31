"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { FantasyTeam } from "@/models/FantasyTeam";
import { refreshMatchPlayers, refreshMatchPlayingStatus } from "@/services/ipl-sync";
import { recomputeFantasyForMatch } from "@/services/fantasy-recompute";
import { recordAudit } from "@/lib/audit";
import {
  FANTASY_TEAM_RULES,
  toFantasyRole,
  type FantasyRole,
} from "@/lib/constants";

export type RosterPlayer = {
  name: string;
  fantasyRole: FantasyRole;
  role?: string;
  teamShort?: string;
  imgUrl?: string;
  profileId?: string;
  /** Post-toss XI status: "playing" | "bench" | "" (not yet announced). */
  playingStatus?: "playing" | "bench" | "";
  /** "IN" once this player has come on as the live Impact Player. */
  playingXIChange?: "IN" | "";
};

/** Load the pickable roster for a match, the user's existing team, and lock state. */
export async function loadFantasyRosterAction(matchId: string) {
  const me = await requireUser();
  await connectDB();

  const match = await Match.findById(matchId)
    .select("teamA teamB teamAShort teamBShort startTime status players")
    .lean();
  if (!match) return { ok: false as const, error: "Match not found" };

  // Ensure roster is present (scrape on demand, same as predictions).
  let roster = match.players ?? [];
  let rosterNotice: string | null = null;
  // Re-scrape if missing entirely OR if it predates image support (no
  // profileId on any player → scraped before image support was added). Using
  // profileId (not imgUrl) avoids re-scraping every load when a player's photo
  // simply couldn't be resolved.
  const oldCache = roster.length > 0 && !roster.some((p) => p.profileId);
  if (!roster.length || oldCache) {
    try {
      await refreshMatchPlayers(matchId);
      const refreshed = await Match.findById(matchId).select("players").lean();
      roster = refreshed?.players ?? roster;
    } catch (e) {
      // Don't hard-fail — the squad just isn't published yet. Let the picker
      // render the match header with a friendly "come back later" notice.
      if (!roster.length) rosterNotice = (e as Error).message;
    }
  }

  // Refresh live XI status around toss time and while the match is live, so the
  // picker shows In XI / Bench / Impact tags as they change (not only at toss).
  // Window: from 90 min before start through the live match. Best-effort.
  const startMs = new Date(match.startTime).getTime();
  const nowMs = Date.now();
  const nearOrLive =
    match.status === "live" || (nowMs >= startMs - 90 * 60_000);
  if (roster.length && nearOrLive) {
    try {
      const r = await refreshMatchPlayingStatus(matchId);
      if (r.changed) {
        const refreshed = await Match.findById(matchId).select("players").lean();
        roster = refreshed?.players ?? roster;
      }
    } catch {
      // ignore — keep prior statuses
    }
  }

  const players: RosterPlayer[] = roster.map((p) => ({
    name: p.name,
    fantasyRole: toFantasyRole(p.role),
    role: p.role,
    teamShort: p.teamShort,
    imgUrl: p.imgUrl,
    profileId: p.profileId,
    playingStatus: p.playingStatus ?? "",
    playingXIChange: p.playingXIChange ?? "",
  }));

  // Whether the playing XI / bench split has been announced (post-toss).
  const xiAnnounced = players.some((p) => p.playingStatus);

  const locked = new Date() >= new Date(match.startTime);

  const existing = await FantasyTeam.findOne({ matchId, userId: me._id })
    .select("players subs captainName viceCaptainName totalPoints")
    .lean();

  return {
    ok: true as const,
    match: {
      id: String(match._id),
      teamA: match.teamA,
      teamB: match.teamB,
      teamAShort: match.teamAShort ?? match.teamA,
      teamBShort: match.teamBShort ?? match.teamB,
      startTime: new Date(match.startTime).toISOString(),
    },
    players,
    xiAnnounced,
    rosterNotice,
    locked,
    team: existing
      ? {
          players: existing.players.map((p) => ({
            name: p.name,
            isCaptain: p.isCaptain,
            isViceCaptain: p.isViceCaptain,
          })),
          subs: (existing.subs ?? [])
            .slice()
            .sort((a, b) => (a.subOrder ?? 0) - (b.subOrder ?? 0))
            .map((p) => p.name),
        }
      : null,
  };
}

/**
 * How often each player has been picked as captain / vice-captain across all
 * saved teams for this match — the Dream11-style "X% chose as C" stat shown on
 * the captain-selection step. Returns name → { captainPct, viceCaptainPct }.
 */
export async function loadFantasyCaptainStatsAction(matchId: string) {
  await requireUser();
  await connectDB();

  const teams = await FantasyTeam.find({ matchId })
    .select("captainName viceCaptainName")
    .lean();

  const total = teams.length;
  const cap: Record<string, number> = {};
  const vc: Record<string, number> = {};
  for (const t of teams) {
    if (t.captainName) cap[t.captainName] = (cap[t.captainName] ?? 0) + 1;
    if (t.viceCaptainName) vc[t.viceCaptainName] = (vc[t.viceCaptainName] ?? 0) + 1;
  }

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const stats: Record<string, { captainPct: number; viceCaptainPct: number }> = {};
  for (const name of new Set([...Object.keys(cap), ...Object.keys(vc)])) {
    stats[name] = {
      captainPct: pct(cap[name] ?? 0),
      viceCaptainPct: pct(vc[name] ?? 0),
    };
  }

  return { ok: true as const, totalTeams: total, stats };
}

const SaveSchema = z.object({
  matchId: z.string().min(1),
  players: z.array(z.string().min(1)).length(FANTASY_TEAM_RULES.TEAM_SIZE),
  captain: z.string().min(1),
  viceCaptain: z.string().min(1),
  /** Up to 4 ordered backups (B1..B4) from outside the XI. */
  subs: z.array(z.string().min(1)).max(FANTASY_TEAM_RULES.MAX_SUBS).optional(),
});

/** Validate composition against Dream11 rules. Returns an error string or null. */
function validateComposition(
  picked: { fantasyRole: FantasyRole; teamShort?: string }[]
): string | null {
  if (picked.length !== FANTASY_TEAM_RULES.TEAM_SIZE)
    return `Pick exactly ${FANTASY_TEAM_RULES.TEAM_SIZE} players`;

  const counts: Record<FantasyRole, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  const perTeam: Record<string, number> = {};
  for (const p of picked) {
    counts[p.fantasyRole]++;
    if (p.teamShort) perTeam[p.teamShort] = (perTeam[p.teamShort] ?? 0) + 1;
  }

  const labels: Record<FantasyRole, string> = {
    WK: "wicket-keeper",
    BAT: "batter",
    AR: "all-rounder",
    BOWL: "bowler",
  };
  for (const role of ["WK", "BAT", "AR", "BOWL"] as FantasyRole[]) {
    if (counts[role] < FANTASY_TEAM_RULES.MIN[role])
      return `Need at least ${FANTASY_TEAM_RULES.MIN[role]} ${labels[role]}(s)`;
    if (counts[role] > FANTASY_TEAM_RULES.MAX[role])
      return `At most ${FANTASY_TEAM_RULES.MAX[role]} ${labels[role]}(s) allowed`;
  }
  for (const [team, n] of Object.entries(perTeam)) {
    if (n > FANTASY_TEAM_RULES.MAX_PER_TEAM)
      return `At most ${FANTASY_TEAM_RULES.MAX_PER_TEAM} players from ${team}`;
  }
  return null;
}

export async function saveFantasyTeamAction(input: {
  matchId: string;
  players: string[];
  captain: string;
  viceCaptain: string;
  subs?: string[];
}) {
  const me = await requireUser();
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Pick exactly 11 players, a captain and a vice-captain" };
  }
  const { matchId, players, captain, viceCaptain } = parsed.data;
  const subs = parsed.data.subs ?? [];

  if (captain === viceCaptain)
    return { ok: false as const, error: "Captain and vice-captain must be different" };
  if (new Set(players).size !== players.length)
    return { ok: false as const, error: "Duplicate players selected" };
  if (!players.includes(captain) || !players.includes(viceCaptain))
    return { ok: false as const, error: "Captain and vice-captain must be in your XI" };
  if (new Set(subs).size !== subs.length)
    return { ok: false as const, error: "Duplicate backups selected" };
  if (subs.some((s) => players.includes(s)))
    return { ok: false as const, error: "Backups must be players outside your XI" };

  await connectDB();
  const match = await Match.findById(matchId)
    .select("startTime status players")
    .lean();
  if (!match) return { ok: false as const, error: "Match not found" };

  if (new Date() >= new Date(match.startTime))
    return { ok: false as const, error: "Team selection is locked — the match has started" };

  const roster = match.players ?? [];
  const byName = new Map(roster.map((p) => [p.name, p]));
  const picked = players.map((name) => byName.get(name));
  if (picked.some((p) => !p))
    return { ok: false as const, error: "One or more players are not in this match's squad" };

  const subPicked = subs.map((name) => byName.get(name));
  if (subPicked.some((p) => !p))
    return { ok: false as const, error: "One or more backups are not in this match's squad" };

  const pickedInfo = picked.map((p) => ({
    name: p!.name,
    profileId: p!.profileId,
    fantasyRole: toFantasyRole(p!.role),
    role: p!.role,
    teamShort: p!.teamShort,
  }));

  const compositionError = validateComposition(pickedInfo);
  if (compositionError) return { ok: false as const, error: compositionError };

  const doc = {
    matchId,
    userId: me._id,
    players: pickedInfo.map((p) => ({
      name: p.name,
      profileId: p.profileId,
      fantasyRole: p.fantasyRole,
      role: p.role,
      teamShort: p.teamShort,
      isCaptain: p.name === captain,
      isViceCaptain: p.name === viceCaptain,
      basePoints: 0,
      points: 0,
    })),
    subs: subPicked.map((p, i) => ({
      name: p!.name,
      profileId: p!.profileId,
      fantasyRole: toFantasyRole(p!.role),
      role: p!.role,
      teamShort: p!.teamShort,
      isCaptain: false,
      isViceCaptain: false,
      subOrder: i + 1,
      basePoints: 0,
      points: 0,
    })),
    captainName: captain,
    viceCaptainName: viceCaptain,
    lockedAt: new Date(match.startTime),
  };

  await FantasyTeam.findOneAndUpdate(
    { matchId, userId: me._id },
    { $set: doc },
    { upsert: true, returnDocument: "after" }
  );

  await recordAudit({
    category: "create",
    action: "fantasy.team.save",
    actor: me,
    targetType: "Match",
    targetId: matchId,
    meta: { captain, viceCaptain, players, subs },
  });

  revalidatePath(`/fantasy/${matchId}`);
  revalidatePath("/fantasy");
  return { ok: true as const };
}

/**
 * Trigger a live points recompute for a match (scrapes the Cricbuzz scorecard
 * and updates everyone's points). Any signed-in member may refresh — it's
 * idempotent and writes objective, scorecard-derived numbers.
 */
export async function recomputeFantasyAction(matchId: string) {
  await requireUser();
  try {
    const res = await recomputeFantasyForMatch(matchId);
    revalidatePath(`/fantasy/${matchId}`);
    revalidatePath("/fantasy");
    return res.ok
      ? { ok: true as const, hasData: res.hasData, teamsUpdated: res.teamsUpdated }
      : { ok: false as const, error: res.error ?? "Could not refresh points" };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** Load the per-match fantasy leaderboard (all teams ranked by total points). */
export async function loadFantasyLeaderboardAction(matchId: string) {
  const me = await requireUser();
  await connectDB();

  const match = await Match.findById(matchId)
    .select("teamA teamB teamAShort teamBShort startTime status players")
    .lean();
  if (!match) return { ok: false as const, error: "Match not found" };

  // Map each player (by profileId, name fallback) to their live XI status so the
  // contest view can tag impact players (came on as the live Impact Player).
  const roster = match.players ?? [];
  const impactKeys = new Set<string>();
  const notPlayingKeys = new Set<string>();
  for (const p of roster) {
    const key = p.profileId ?? p.name;
    if (p.playingXIChange === "IN") impactKeys.add(key);
    else if (p.playingStatus === "bench") notPlayingKeys.add(key);
  }
  const isImpact = (p: { profileId?: string; name: string }) =>
    impactKeys.has(p.profileId ?? p.name);
  const isNotPlaying = (p: { profileId?: string; name: string }) =>
    notPlayingKeys.has(p.profileId ?? p.name);

  const teams = await FantasyTeam.find({ matchId })
    .select("userId players subs captainName viceCaptainName totalPoints pointsComputedAt")
    .populate<{ userId: { _id: unknown; name?: string } }>("userId", "name")
    .lean();

  const rows = teams
    .map((t) => ({
      userId: String(
        (t.userId as { _id?: unknown })?._id ?? t.userId
      ),
      userName: (t.userId as { name?: string })?.name ?? "Unknown",
      isMe:
        String((t.userId as { _id?: unknown })?._id ?? t.userId) === String(me._id),
      captain: t.captainName,
      viceCaptain: t.viceCaptainName,
      totalPoints: Math.round((t.totalPoints ?? 0) * 100) / 100,
      players: [
        ...t.players.map((p) => ({
          name: p.name,
          teamShort: p.teamShort,
          fantasyRole: p.fantasyRole,
          isCaptain: p.isCaptain,
          isViceCaptain: p.isViceCaptain,
          points: Math.round((p.points ?? 0) * 100) / 100,
          basePoints: Math.round((p.basePoints ?? 0) * 100) / 100,
          isSub: false,
          isImpact: isImpact(p),
          isNotPlaying: isNotPlaying(p),
          replacedByName: p.replacedByName ?? null,
        })),
        // Active backups that came in for a "Not Playing" starter.
        ...(t.subs ?? [])
          .filter((s) => s.activeForName)
          .map((s) => ({
            name: s.name,
            teamShort: s.teamShort,
            fantasyRole: s.fantasyRole,
            isCaptain: s.isCaptain,
            isViceCaptain: s.isViceCaptain,
            points: Math.round((s.points ?? 0) * 100) / 100,
            basePoints: Math.round((s.basePoints ?? 0) * 100) / 100,
            isSub: true,
            isImpact: isImpact(s),
            isNotPlaying: false,
            replacedByName: null,
          })),
      ],
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const computedAt =
    teams.reduce<Date | null>((latest, t) => {
      const d = t.pointsComputedAt ? new Date(t.pointsComputedAt) : null;
      if (!d) return latest;
      return !latest || d > latest ? d : latest;
    }, null);

  return {
    ok: true as const,
    match: {
      id: String(match._id),
      teamAShort: match.teamAShort ?? match.teamA,
      teamBShort: match.teamBShort ?? match.teamB,
      status: match.status,
    },
    rows,
    pointsComputedAt: computedAt ? computedAt.toISOString() : null,
  };
}
