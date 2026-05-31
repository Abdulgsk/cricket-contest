// Recompute live fantasy points for a match: scrape the Cricbuzz scorecard,
// score every player (services/fantasy-scoring.ts), then fill in per-player and
// team totals on every saved FantasyTeam for the match. Safe to run repeatedly
// while a match is live — it's idempotent for a given scorecard state.

import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { FantasyTeam } from "@/models/FantasyTeam";
import { resolveCricbuzzId, refreshMatchPlayingStatus } from "@/services/ipl-sync";
import { scrapeCricbuzzScorecard } from "@/lib/scrapers/cricbuzz-scorecard";
import { computeFantasyScores, type FantasyPlayerScore } from "@/services/fantasy-scoring";
import { FANTASY_TEAM_RULES, toFantasyRole, type FantasyRole } from "@/lib/constants";

export interface RecomputeResult {
  ok: boolean;
  matchId: string;
  teamsUpdated: number;
  playersScored: number;
  hasData: boolean;
  error?: string;
}

/** Captain / vice-captain multiplier for a picked player. */
function multiplierFor(p: { isCaptain: boolean; isViceCaptain: boolean }): number {
  if (p.isCaptain) return FANTASY_TEAM_RULES.CAPTAIN_MULTIPLIER;
  if (p.isViceCaptain) return FANTASY_TEAM_RULES.VICE_CAPTAIN_MULTIPLIER;
  return 1;
}

/** Tie-break role rank for backup substitution order (My11: Bat > AR > WK > Bowl). */
const SUB_ROLE_RANK: Record<FantasyRole, number> = { BAT: 0, AR: 1, WK: 2, BOWL: 3 };

/**
 * Recompute fantasy scoring for one match.
 *
 * @param matchId Mongo id of the match
 * @returns summary of what was updated
 */
export async function recomputeFantasyForMatch(matchId: string): Promise<RecomputeResult> {
  await connectDB();

  const match = await Match.findById(matchId).select("cricbuzzId cricbuzzSlug players").lean();
  if (!match) {
    return { ok: false, matchId, teamsUpdated: 0, playersScored: 0, hasData: false, error: "Match not found" };
  }

  // Resolve the Cricbuzz id/slug (persists onto the match if newly resolved).
  let cricbuzzId = match.cricbuzzId;
  let slug = match.cricbuzzSlug;
  if (!cricbuzzId || !slug) {
    try {
      const r = await resolveCricbuzzId(matchId);
      cricbuzzId = r.cricbuzzId;
      slug = r.slug;
    } catch (e) {
      return { ok: false, matchId, teamsUpdated: 0, playersScored: 0, hasData: false, error: (e as Error).message };
    }
  }

  let scorecard;
  try {
    scorecard = await scrapeCricbuzzScorecard(cricbuzzId!, slug!);
  } catch (e) {
    return { ok: false, matchId, teamsUpdated: 0, playersScored: 0, hasData: false, error: (e as Error).message };
  }

  // Refresh live XI status (playing / bench / impact-in) so impact-player
  // substitutions are picked up while the match is in progress. Best-effort —
  // status-only merge; a failure keeps the previous statuses. We then re-read
  // the roster so this tick scores against the freshest status.
  try {
    const r = await refreshMatchPlayingStatus(matchId);
    if (r.changed) {
      const reread = await Match.findById(matchId).select("players").lean();
      if (reread?.players) match.players = reread.players;
    }
  } catch {
    // ignore — keep prior statuses
  }
  const rosterPlayers = match.players ?? [];

  // Build a role map from the match roster so duck / strike-rate apply correctly.
  const roles = new Map<string, FantasyRole>();
  for (const p of rosterPlayers) {
    if (p.profileId) roles.set(p.profileId, toFantasyRole(p.role));
  }

  // Post-toss playing status per player (keyed by profileId, then name fallback).
  // A player "effectively plays" (and scores) if they're in the announced XI OR
  // have come on as the live Impact Player. Until the XI is announced everyone
  // is treated as playing so no premature substitutions happen.
  const xiAnnounced = rosterPlayers.some((p) => p.playingStatus);
  const matchPlayers = rosterPlayers;
  function effectivePlaying(p: { profileId?: string; name: string }): boolean {
    if (!xiAnnounced) return true;
    const r = matchPlayers.find((x) =>
      p.profileId ? x.profileId === p.profileId : x.name === p.name
    );
    if (!r) return true;
    return r.playingStatus === "playing" || r.playingXIChange === "IN";
  }

  const scores: Map<string, FantasyPlayerScore> = computeFantasyScores(scorecard, roles);
  const scoreOf = (p: { profileId?: string }) =>
    (p.profileId ? scores.get(p.profileId)?.total : 0) ?? 0;

  // Update every saved team for this match.
  const teams = await FantasyTeam.find({ matchId });
  const now = new Date();
  let teamsUpdated = 0;
  for (const team of teams) {
    applyBackupSubstitutions(team, effectivePlaying);

    let total = 0;
    for (const p of team.players) {
      const base = p.replacedByName ? 0 : scoreOf(p);
      const pts = base * multiplierFor(p);
      p.basePoints = base;
      p.points = pts;
      total += pts;
    }
    for (const s of team.subs ?? []) {
      const active = !!s.activeForName;
      const base = active ? scoreOf(s) : 0;
      const pts = base * multiplierFor(s);
      s.basePoints = base;
      s.points = pts;
      if (active) total += pts;
    }
    team.totalPoints = total;
    team.pointsComputedAt = now;
    await team.save();
    teamsUpdated += 1;
  }

  return {
    ok: true,
    matchId,
    teamsUpdated,
    playersScored: scores.size,
    hasData: scorecard.hasData,
  };
}

/**
 * Apply My11-style "Backup" substitutions to a team in place, based on current
 * playing status. Mutates `team.players` (sets/clears `replacedByName`,
 * re-assigns isCaptain/isViceCaptain) and `team.subs` (sets/clears
 * `activeForName`, isCaptain/isViceCaptain).
 *
 * Rules (no credits in this app, so gated only by priority + the >=1 WK rule):
 *  - "Not Playing" starters are replaced by available backups in B1..B4 order.
 *  - Not-playing starters are processed Captain, Vice-captain, then by role rank
 *    (Bat > AR > WK > Bowl) and name.
 *  - A replacement must leave the active XI with at least one wicket-keeper.
 *  - If a replaced starter was C/VC, the backup inherits that role.
 *  - Stateless: recomputed from current status each tick, so an Impact Player
 *    who later comes on reclaims their slot automatically (the backup deactivates).
 */
type SubPlayer = {
  name: string;
  profileId?: string;
  fantasyRole: FantasyRole;
  subOrder?: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  replacedByName?: string | null;
  activeForName?: string | null;
};

function applyBackupSubstitutions(
  team: { players: SubPlayer[]; subs?: SubPlayer[]; captainName: string; viceCaptainName: string },
  isPlaying: (p: { profileId?: string; name: string }) => boolean
) {
  const starters = team.players;
  const subs = (team.subs ?? []).slice().sort((a, b) => (a.subOrder ?? 0) - (b.subOrder ?? 0));

  // Reset prior substitution state and restore original C/VC by name.
  for (const p of starters) {
    p.replacedByName = null;
    p.isCaptain = p.name === team.captainName;
    p.isViceCaptain = p.name === team.viceCaptainName;
  }
  for (const s of subs) {
    s.activeForName = null;
    s.isCaptain = false;
    s.isViceCaptain = false;
  }

  // Backups that are currently playing and therefore usable, in priority order.
  const usableSubs = subs.filter((s) => isPlaying(s));
  const usedSub = new Set<SubPlayer>();

  // Active wicket-keeper count = playing starters who are WK (replacements added below).
  let activeWk = starters.filter((p) => isPlaying(p) && p.fantasyRole === "WK").length;

  // Not-playing starters, ordered: Captain, Vice-captain, then role rank, then name.
  const notPlaying = starters
    .filter((p) => !isPlaying(p))
    .sort((a, b) => {
      const ra = a.isCaptain ? 0 : a.isViceCaptain ? 1 : 2;
      const rb = b.isCaptain ? 0 : b.isViceCaptain ? 1 : 2;
      if (ra !== rb) return ra - rb;
      const sa = SUB_ROLE_RANK[a.fantasyRole];
      const sb = SUB_ROLE_RANK[b.fantasyRole];
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });

  for (const np of notPlaying) {
    for (const b of usableSubs) {
      if (usedSub.has(b)) continue;
      // Must keep >=1 WK in the active XI. Replacing a not-playing WK with a
      // non-WK backup is only allowed if another WK is already active.
      const wkAfter = activeWk + (b.fantasyRole === "WK" ? 1 : 0);
      if (np.fantasyRole === "WK" && wkAfter < 1) continue;
      // Activate this backup for this slot.
      np.replacedByName = b.name;
      b.activeForName = np.name;
      if (np.isCaptain) b.isCaptain = true;
      if (np.isViceCaptain) b.isViceCaptain = true;
      usedSub.add(b);
      if (b.fantasyRole === "WK") activeWk += 1;
      break;
    }
  }
}

/**
 * Recompute fantasy scoring for every live match. Best-effort: a failure on one
 * match never blocks the others. Intended to be called from the lazy match
 * status tick while at least one match is in progress.
 */
export async function recomputeFantasyForLiveMatches(): Promise<RecomputeResult[]> {
  await connectDB();
  const live = await Match.find({ status: "live" }).select("_id").lean();
  const results: RecomputeResult[] = [];
  for (const m of live) {
    try {
      results.push(await recomputeFantasyForMatch(String(m._id)));
    } catch (e) {
      results.push({
        ok: false,
        matchId: String(m._id),
        teamsUpdated: 0,
        playersScored: 0,
        hasData: false,
        error: (e as Error).message,
      });
    }
  }
  return results;
}
