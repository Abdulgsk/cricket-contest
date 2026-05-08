import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { MatchResult, type IMatchResult } from "@/models/MatchResult";
import type { HydratedDocument } from "mongoose";
import { Prediction } from "@/models/Prediction";
import { CustomPoolPrediction } from "@/models/CustomPoolPrediction";
import { BonusAuditLog } from "@/models/BonusAuditLog";
import { User } from "@/models/User";
import { getSettings } from "@/models/Settings";
import {
  RANK_POINTS,
  PENALTIES,
  BONUSES,
  MAX_BONUS_PER_MATCH,
  PREDICTION_POINTS,
} from "@/lib/constants";
import mongoose from "mongoose";

interface AdminResultEntry {
  userId: string; // mongo id
  rank: number; // 0 = missed
  fantasyPoints: number;
}

interface MatchPredictionResult {
  winner: string;
  topBatter: string;
  topBowler: string;
}

/**
 * Process all results for a match in one go.
 * Steps:
 *   1. Persist raw results.
 *   2. Calculate base points (rank table) honoring doublePoints / noBonus.
 *   3. Calculate penalties using consecutive-miss history.
 *   4. Calculate bonuses (capped).
 *   5. Score predictions.
 *   6. Update match status -> completed.
 */
export async function processMatchResults(
  matchId: string,
  entries: AdminResultEntry[],
  predictionResult: MatchPredictionResult | null,
  opts: { scoreSummary?: string } = {}
) {
  await connectDB();
  const match = await Match.findById(matchId);
  if (!match) throw new Error("Match not found");

  const doubleMul = match.doublePoints ? 2 : 1;
  const allowBonuses = !match.noBonus;
  const chaos = !!match.chaosMatch;
  const madness = !!match.predictionMadness;

  // --- Snapshot leaderboard BEFORE this match (for movement & bonuses) ---
  const prevLb = await computeLeaderboard({ excludeMatchId: matchId });
  const prevRankMap = new Map(prevLb.map((r, i) => [String(r.userId), i + 1]));
  const prevLeaderId = prevLb[0]?.userId ? String(prevLb[0].userId) : null;
  const settings = await getSettings();
  const bountyId = settings.bountyHolderUserId ? String(settings.bountyHolderUserId) : null;

  // --- Persist raw results & compute base+penalty per user ---
  const created: HydratedDocument<IMatchResult>[] = [];
  for (const e of entries) {
    const missed = !e.rank || e.rank === 0;
    const base = missed ? 0 : (RANK_POINTS[e.rank] ?? 0) * doubleMul;

    // Penalty: missed match + consecutive miss escalation
    let penaltyTotal = 0;
    const penaltyBreak: { type: string; points: number; reason: string }[] = [];
    if (missed) {
      penaltyTotal += PENALTIES.MISSED_MATCH;
      penaltyBreak.push({
        type: "missed_match",
        points: PENALTIES.MISSED_MATCH,
        reason: "Did not submit Dream11 team for this match",
      });
      const consec = await countConsecutiveMisses(e.userId, match.startTime);
      // consec includes this match; so 2 consecutive => apply extra, 3+ => apply extra-extra
      if (consec >= 2) {
        penaltyTotal += PENALTIES.TWO_CONSECUTIVE_MISSES_EXTRA;
        penaltyBreak.push({
          type: "two_consecutive_miss",
          points: PENALTIES.TWO_CONSECUTIVE_MISSES_EXTRA,
          reason: "2 consecutive missed matches",
        });
      }
      if (consec >= 3) {
        penaltyTotal += PENALTIES.THREE_CONSECUTIVE_MISSES_EXTRA;
        penaltyBreak.push({
          type: "three_consecutive_miss",
          points: PENALTIES.THREE_CONSECUTIVE_MISSES_EXTRA,
          reason: "3+ consecutive missed matches",
        });
      }
    }

    const upsert = await MatchResult.findOneAndUpdate(
      { matchId, userId: e.userId },
      {
        matchId,
        userId: e.userId,
        rank: e.rank,
        fantasyPoints: e.fantasyPoints,
        missed,
        basePoints: base,
        penaltyPoints: penaltyTotal,
        penalties: penaltyBreak,
        bonusPoints: 0,
        bonuses: [],
        finalPoints: base + penaltyTotal,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    created.push(upsert!);
  }

  // --- Bonuses (need full match snapshot first) ---
  if (allowBonuses) {
    await applyBonuses({
      matchId,
      results: created,
      prevRankMap,
      prevLeaderId,
      bountyId,
      chaos,
    });
  }

  // --- Score predictions for this match ---
  if (predictionResult) {
    await scorePredictions(matchId, predictionResult, { madness });
  }

  match.status = "completed";
  match.resultsEntered = true;
  match.predictionsLocked = true;
  if (predictionResult?.winner) {
    match.matchWinner = predictionResult.winner;
  }
  if (opts.scoreSummary) {
    match.scoreSummary = opts.scoreSummary;
  }
  await match.save();
}

async function countConsecutiveMisses(userId: string, beforeOrAtDate: Date): Promise<number> {
  // Look at this user's last few matches up to and including the current one,
  // counting trailing consecutive misses.
  const recent = await MatchResult.find({ userId })
    .populate({ path: "matchId", select: "startTime", model: Match })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  // Filter to matches at or before given date sorted desc by match time
  const sorted = recent
    .filter((r) => r.matchId && (r.matchId as unknown as { startTime: Date }).startTime <= beforeOrAtDate)
    .sort((a, b) => {
      const ad = (a.matchId as unknown as { startTime: Date }).startTime.getTime();
      const bd = (b.matchId as unknown as { startTime: Date }).startTime.getTime();
      return bd - ad;
    });
  let count = 1; // counting this current insertion
  for (const r of sorted) {
    if (r.missed) count++;
    else break;
  }
  return count;
}

async function applyBonuses(args: {
  matchId: string;
  results: HydratedDocument<IMatchResult>[];
  prevRankMap: Map<string, number>;
  prevLeaderId: string | null;
  bountyId: string | null;
  chaos: boolean;
}) {
  const { matchId, results, prevRankMap, prevLeaderId, bountyId, chaos } = args;
  // In Chaos mode, every bonus value is doubled and the per-match cap is doubled too.
  const bonusMul = chaos ? 2 : 1;
  const cap = chaos ? MAX_BONUS_PER_MATCH * 2 : MAX_BONUS_PER_MATCH;

  // Sort results by rank (1 best). Skip missed.
  const ranked = [...results].filter((r) => !r.missed && r.rank > 0).sort((a, b) => a.rank - b.rank);
  const top1 = ranked[0];
  const top2 = ranked[1];
  const top5 = new Set(ranked.slice(0, 5).map((r) => String(r.userId)));

  // Match domination: top1 wins by >= 100 fp over top2
  const dominationApplies =
    top1 && top2 && top1.fantasyPoints - top2.fantasyPoints >= 100;

  // Compute "after this match" leaderboard for comeback / king slayer / underdog
  const newLb = await computeLeaderboard();
  const newRankMap = new Map(newLb.map((r, i) => [String(r.userId), i + 1]));

  for (const r of results) {
    const uid = String(r.userId);
    const breakdown: { type: string; points: number; reason: string }[] = [];
    let total = 0;
    const add = (type: string, points: number, reason: string) => {
      const adj = points * bonusMul;
      breakdown.push({ type, points: adj, reason: chaos ? `${reason} (Chaos ×2)` : reason });
      total += adj;
    };

    // King Slayer: finished above current overall #1
    if (prevLeaderId && uid !== prevLeaderId && !r.missed) {
      const slayer = ranked.find((x) => String(x.userId) === uid);
      const leaderRes = ranked.find((x) => String(x.userId) === prevLeaderId);
      if (slayer && (!leaderRes || slayer.rank < leaderRes.rank)) {
        add("king_slayer", BONUSES.KING_SLAYER, "Finished above the current overall leader");
      }
    }

    // Comeback: gained 4+ positions in overall leaderboard
    const prevPos = prevRankMap.get(uid);
    const newPos = newRankMap.get(uid);
    if (prevPos && newPos && prevPos - newPos >= 4) {
      add("comeback", BONUSES.COMEBACK, `Climbed ${prevPos - newPos} leaderboard positions`);
    }

    // Underdog: was ranked 10-13 overall AND finished top 2
    if (prevPos && prevPos >= 10 && prevPos <= 13 && top1 && top2) {
      const isTop2 = String(top1.userId) === uid || String(top2.userId) === uid;
      if (isTop2) add("underdog", BONUSES.UNDERDOG, `Was overall #${prevPos} and finished top 2`);
    }

    // Match domination: only the winner gets it
    if (dominationApplies && top1 && String(top1.userId) === uid) {
      add(
        "match_domination",
        BONUSES.MATCH_DOMINATION,
        `Won by ${top1.fantasyPoints - top2.fantasyPoints} Dream11 points`
      );
    }

    // Bounty: beat the bounty holder this match
    if (bountyId && bountyId !== uid && !r.missed) {
      const bountyRes = results.find((x) => String(x.userId) === bountyId);
      if (bountyRes && !bountyRes.missed && r.rank < bountyRes.rank) {
        add("bounty", BONUSES.BOUNTY, "Beat the bounty holder this match");
      }
    }

    // Consistency: 3 consecutive top-5 finishes (this match counts)
    if (!r.missed && top5.has(uid)) {
      const streak = await countConsecutiveTop5(uid, matchId);
      if (streak >= 3) {
        add("consistency", BONUSES.CONSISTENCY, "3 consecutive Top 5 finishes");
      }
    }

    // Apply per-match cap (doubled in Chaos mode)
    let bonusPoints = total;
    if (bonusPoints > cap) {
      bonusPoints = cap;
      breakdown.push({
        type: "cap_applied",
        points: 0,
        reason: `Bonus capped at ${cap}`,
      });
    }

    r.bonusPoints = bonusPoints;
    r.bonuses = breakdown;
    r.finalPoints = r.basePoints + r.penaltyPoints + bonusPoints;
    await r.save();

    // Audit log per applied bonus
    for (const b of breakdown.filter((x) => x.points > 0)) {
      await BonusAuditLog.create({
        userId: r.userId,
        matchId,
        bonusType: b.type,
        points: b.points,
        explanation: b.reason,
      });
    }
  }
}

async function countConsecutiveTop5(userId: string, currentMatchId: string): Promise<number> {
  const recent = await MatchResult.find({ userId })
    .populate({ path: "matchId", select: "startTime", model: Match })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  // include current first
  const sorted = recent.sort((a, b) => {
    const ad = (a.matchId as unknown as { startTime: Date })?.startTime?.getTime() ?? 0;
    const bd = (b.matchId as unknown as { startTime: Date })?.startTime?.getTime() ?? 0;
    return bd - ad;
  });
  let count = 0;
  for (const r of sorted) {
    if (!r.missed && r.rank > 0 && r.rank <= 5) count++;
    else break;
  }
  if (count === 0 && currentMatchId) count = 1; // safety
  return count;
}

async function scorePredictions(
  matchId: string,
  result: MatchPredictionResult,
  opts: { madness?: boolean } = {}
) {
  const mul = opts.madness ? 2 : 1;
  const preds = await Prediction.find({ matchId });
  for (const p of preds) {
    let pts = 0;
    p.correctWinner = p.winner === result.winner;
    p.correctBatter = p.topBatter === result.topBatter;
    p.correctBowler = p.topBowler === result.topBowler;
    if (p.correctWinner) pts += PREDICTION_POINTS.WINNER;
    if (p.correctBatter) pts += PREDICTION_POINTS.TOP_BATTER;
    if (p.correctBowler) pts += PREDICTION_POINTS.TOP_BOWLER;
    if (p.correctWinner && p.correctBatter && p.correctBowler) {
      pts += PREDICTION_POINTS.ALL_THREE_BONUS;
      p.allThreeBonus = true;
    }
    p.pointsAwarded = pts * mul;
    p.scored = true;
    await p.save();
  }
}

/** Aggregate full leaderboard from all match results (+ prediction points). */
export async function computeLeaderboard(opts?: { excludeMatchId?: string }) {
  await connectDB();
  const matchFilter = opts?.excludeMatchId
    ? { matchId: { $ne: new mongoose.Types.ObjectId(opts.excludeMatchId) } }
    : {};

  const results = await MatchResult.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: "$userId",
        totalPoints: { $sum: "$finalPoints" },
        basePoints: { $sum: "$basePoints" },
        bonusPoints: { $sum: "$bonusPoints" },
        penaltyPoints: { $sum: "$penaltyPoints" },
        matches: { $sum: 1 },
        wins: { $sum: { $cond: [{ $eq: ["$rank", 1] }, 1, 0] } },
        top3: { $sum: { $cond: [{ $and: [{ $gt: ["$rank", 0] }, { $lte: ["$rank", 3] }] }, 1, 0] } },
        top5: { $sum: { $cond: [{ $and: [{ $gt: ["$rank", 0] }, { $lte: ["$rank", 5] }] }, 1, 0] } },
        missed: { $sum: { $cond: ["$missed", 1, 0] } },
        ranks: { $push: { $cond: [{ $gt: ["$rank", 0] }, "$rank", null] } },
      },
    },
  ]);

  // prediction points
  const predAgg = await Prediction.aggregate([
    { $match: { scored: true } },
    { $group: { _id: "$userId", predPoints: { $sum: "$pointsAwarded" } } },
  ]);
  const predMap = new Map(predAgg.map((p) => [String(p._id), p.predPoints as number]));

  // custom pool points
  const poolAgg = await CustomPoolPrediction.aggregate([
    { $match: { scored: true } },
    { $group: { _id: "$userId", poolPoints: { $sum: "$pointsAwarded" } } },
  ]);
  const poolMap = new Map(poolAgg.map((p) => [String(p._id), p.poolPoints as number]));

  const users = await User.find().lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const merged = results.map((r) => {
    const u = userMap.get(String(r._id));
    const ranks = (r.ranks as (number | null)[]).filter((x): x is number => !!x);
    const avg = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
    const pred = predMap.get(String(r._id)) ?? 0;
    const pool = poolMap.get(String(r._id)) ?? 0;
    return {
      userId: r._id,
      username: u?.username ?? "Unknown",
      handle: u?.userId ?? "",
      totalPoints: (r.totalPoints as number) + pred + pool,
      leaguePoints: r.totalPoints as number,
      predictionPoints: pred + pool,
      customPoolPoints: pool,
      basePoints: r.basePoints as number,
      bonusPoints: r.bonusPoints as number,
      penaltyPoints: r.penaltyPoints as number,
      matches: r.matches as number,
      wins: r.wins as number,
      top3: r.top3 as number,
      top5: r.top5 as number,
      missed: r.missed as number,
      averageFinish: avg,
    };
  });

  // Add users with no results
  for (const u of users) {
    if (!merged.find((m) => String(m.userId) === String(u._id))) {
      const pred = predMap.get(String(u._id)) ?? 0;
      const pool = poolMap.get(String(u._id)) ?? 0;
      merged.push({
        userId: u._id,
        username: u.username,
        handle: u.userId,
        totalPoints: pred + pool,
        leaguePoints: 0,
        predictionPoints: pred + pool,
        customPoolPoints: pool,
        basePoints: 0,
        bonusPoints: 0,
        penaltyPoints: 0,
        matches: 0,
        wins: 0,
        top3: 0,
        top5: 0,
        missed: 0,
        averageFinish: 0,
      });
    }
  }

  merged.sort((a, b) => b.totalPoints - a.totalPoints);
  return merged;
}

export type LeaderboardRow = Awaited<ReturnType<typeof computeLeaderboard>>[number];
