/**
 * Facts analyzer — a small "mini model" that turns raw MatchResult / Rivalry
 * history into verified per-user metrics. The facts generator uses these
 * numbers (rather than a single match's snapshot) to decide what is actually
 * noteworthy, so we stop emitting claims that are misleading or trivial.
 *
 * Everything here is derived directly from persisted documents — no claim is
 * made unless the underlying numbers support it.
 */

import { MatchResult, type IMatchResult } from "@/models/MatchResult";
import { Match } from "@/models/Match";
import { Rivalry } from "@/models/Rivalry";
import type { Types } from "mongoose";

const RECENT_WINDOW = 5;
const MIN_SAMPLE = 3; // never emit form/consistency claims below this

export interface UserMetrics {
  userId: string;
  played: number;
  missed: number;
  missRate: number;
  career: {
    avgFantasy: number;
    avgFinal: number;
    avgRank: number; // ignores missed
  };
  recent: {
    n: number;
    avgFantasy: number;
    avgFinal: number;
    avgRank: number; // ignores missed
    missed: number;
    top5: number;
  };
  /** stddev of fantasy points across all played matches (lower = more consistent) */
  consistency: number | null;
  /** recent.avgFinal - career.avgFinal — positive means trending up */
  formDelta: number | null;
  /** percentile by career avg final points among `population` (0-100, higher = better) */
  careerPercentile: number | null;
  /** longest current streak of consecutive misses (counting back from latest) */
  currentMissStreak: number;
  /** longest current streak of top-5 finishes (counting back from latest) */
  currentTop5Streak: number;
}

export interface H2HRecord {
  a: string;
  b: string;
  matchesTogether: number;
  aWins: number; // a beat b on fantasy points (both played)
  bWins: number;
  ties: number;
  /** rivalry-only record (settled rivalries between them) */
  rivalryAWins: number;
  rivalryBWins: number;
}

export interface AnalyzerSnapshot {
  metrics: Map<string, UserMetrics>;
  /** Average gap between #1 and #2 across matches in the season (population-level) */
  avgTop1Top2Gap: number | null;
  /** Average winning margin over recent matches (last 10) */
  recentTop1Top2Gap: number | null;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

/**
 * Build a snapshot of metrics for the given userIds, computed from every
 * MatchResult that exists at or before `upToMatchId` (inclusive). The
 * `upToMatchId` is the just-scored match — its results count toward every
 * metric so facts reflect "as of right now".
 */
export async function buildAnalyzerSnapshot(
  userIds: string[],
  upToMatchId: string
): Promise<AnalyzerSnapshot> {
  // Fetch all matches up to & including the current one, ordered chronologically.
  // We need this to (a) order results by match start time and (b) compute the
  // population-level gap statistics.
  const upToMatch = await Match.findById(upToMatchId).select("startTime").lean();
  const cutoff = upToMatch?.startTime ?? new Date();
  const matches = await Match.find({
    startTime: { $lte: cutoff },
    resultsEntered: true,
  })
    .select("_id startTime")
    .sort({ startTime: 1 })
    .lean();
  const matchIds = matches.map((m) => m._id);
  const startTimeById = new Map(
    matches.map((m) => [String(m._id), new Date(m.startTime).getTime()])
  );

  // Pull every result for these matches in one go.
  const allResults = await MatchResult.find({
    matchId: { $in: matchIds },
  }).lean<IMatchResult[]>();

  // Group by user, ordered by match start time (oldest -> newest).
  const byUser = new Map<string, IMatchResult[]>();
  for (const r of allResults) {
    const uid = String(r.userId);
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push(r);
  }
  for (const arr of byUser.values()) {
    arr.sort(
      (a, b) =>
        (startTimeById.get(String(a.matchId)) ?? 0) -
        (startTimeById.get(String(b.matchId)) ?? 0)
    );
  }

  // Career-final averages for percentile ranking (population = anyone with >= MIN_SAMPLE played matches)
  const populationAvgFinals: number[] = [];
  for (const arr of byUser.values()) {
    const played = arr.filter((r) => !r.missed);
    if (played.length >= MIN_SAMPLE) {
      populationAvgFinals.push(mean(played.map((r) => r.finalPoints)));
    }
  }
  populationAvgFinals.sort((a, b) => a - b);

  function percentile(value: number): number | null {
    if (!populationAvgFinals.length) return null;
    // fraction strictly below value
    let below = 0;
    for (const v of populationAvgFinals) {
      if (v < value) below++;
      else break;
    }
    return Math.round((below / populationAvgFinals.length) * 100);
  }

  const metrics = new Map<string, UserMetrics>();
  for (const uid of userIds) {
    const arr = byUser.get(uid) ?? [];
    const played = arr.filter((r) => !r.missed);
    const missed = arr.filter((r) => r.missed);
    const recentArr = arr.slice(-RECENT_WINDOW);
    const recentPlayed = recentArr.filter((r) => !r.missed);

    const careerAvgFantasy = mean(played.map((r) => r.fantasyPoints));
    const careerAvgFinal = mean(played.map((r) => r.finalPoints));
    const careerAvgRank = played.length ? mean(played.map((r) => r.rank)) : 0;
    const recentAvgFantasy = mean(recentPlayed.map((r) => r.fantasyPoints));
    const recentAvgFinal = mean(recentPlayed.map((r) => r.finalPoints));
    const recentAvgRank = recentPlayed.length
      ? mean(recentPlayed.map((r) => r.rank))
      : 0;

    // streaks counted backward from most recent match
    let currentMissStreak = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].missed) currentMissStreak++;
      else break;
    }
    let currentTop5Streak = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const r = arr[i];
      if (!r.missed && r.rank > 0 && r.rank <= 5) currentTop5Streak++;
      else break;
    }

    metrics.set(uid, {
      userId: uid,
      played: played.length,
      missed: missed.length,
      missRate: arr.length ? missed.length / arr.length : 0,
      career: {
        avgFantasy: careerAvgFantasy,
        avgFinal: careerAvgFinal,
        avgRank: careerAvgRank,
      },
      recent: {
        n: recentArr.length,
        avgFantasy: recentAvgFantasy,
        avgFinal: recentAvgFinal,
        avgRank: recentAvgRank,
        missed: recentArr.filter((r) => r.missed).length,
        top5: recentPlayed.filter((r) => r.rank > 0 && r.rank <= 5).length,
      },
      consistency: stddev(played.map((r) => r.fantasyPoints)),
      formDelta:
        recentPlayed.length >= MIN_SAMPLE && played.length >= MIN_SAMPLE
          ? recentAvgFinal - careerAvgFinal
          : null,
      careerPercentile:
        played.length >= MIN_SAMPLE ? percentile(careerAvgFinal) : null,
      currentMissStreak,
      currentTop5Streak,
    });
  }

  // Population-level top1/top2 gaps
  const gaps: { gap: number; t: number }[] = [];
  const resultsByMatch = new Map<string, IMatchResult[]>();
  for (const r of allResults) {
    const mid = String(r.matchId);
    if (!resultsByMatch.has(mid)) resultsByMatch.set(mid, []);
    resultsByMatch.get(mid)!.push(r);
  }
  for (const [mid, rs] of resultsByMatch.entries()) {
    const ranked = rs
      .filter((r) => !r.missed && r.rank > 0)
      .sort((a, b) => a.rank - b.rank);
    if (ranked.length >= 2) {
      gaps.push({
        gap: ranked[0].fantasyPoints - ranked[1].fantasyPoints,
        t: startTimeById.get(mid) ?? 0,
      });
    }
  }
  gaps.sort((a, b) => a.t - b.t);
  const avgTop1Top2Gap = gaps.length ? mean(gaps.map((g) => g.gap)) : null;
  const recentGaps = gaps.slice(-10);
  const recentTop1Top2Gap = recentGaps.length
    ? mean(recentGaps.map((g) => g.gap))
    : null;

  return { metrics, avgTop1Top2Gap, recentTop1Top2Gap };
}

/**
 * Head-to-head record between two users across every match they both played
 * (fantasy-points basis), plus any settled rivalries between them.
 */
export async function headToHead(
  userIdA: string,
  userIdB: string
): Promise<H2HRecord> {
  const results = await MatchResult.find({
    userId: { $in: [userIdA, userIdB] },
  })
    .select("matchId userId fantasyPoints missed")
    .lean();
  const byMatch = new Map<string, { a?: IMatchResult; b?: IMatchResult }>();
  for (const r of results) {
    const mid = String(r.matchId);
    if (!byMatch.has(mid)) byMatch.set(mid, {});
    const slot = byMatch.get(mid)!;
    if (String(r.userId) === userIdA) slot.a = r as IMatchResult;
    else slot.b = r as IMatchResult;
  }
  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  let together = 0;
  for (const { a, b } of byMatch.values()) {
    if (!a || !b) continue;
    if (a.missed || b.missed) continue;
    together++;
    if (a.fantasyPoints > b.fantasyPoints) aWins++;
    else if (a.fantasyPoints < b.fantasyPoints) bWins++;
    else ties++;
  }
  const rivalries = await Rivalry.find({
    status: "accepted",
    settled: true,
    $or: [
      { challengerId: userIdA, opponentId: userIdB },
      { challengerId: userIdB, opponentId: userIdA },
    ],
  })
    .select("winnerId")
    .lean();
  let rivalryAWins = 0;
  let rivalryBWins = 0;
  for (const r of rivalries) {
    if (!r.winnerId) continue;
    if (String(r.winnerId) === userIdA) rivalryAWins++;
    else if (String(r.winnerId) === userIdB) rivalryBWins++;
  }
  return {
    a: userIdA,
    b: userIdB,
    matchesTogether: together,
    aWins,
    bWins,
    ties,
    rivalryAWins,
    rivalryBWins,
  };
}

// Re-exports so the type checker is happy if Types is unused at runtime.
export type { Types };
