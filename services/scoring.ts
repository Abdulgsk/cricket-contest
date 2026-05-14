import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { MatchResult, type IMatchResult } from "@/models/MatchResult";
import type { HydratedDocument } from "mongoose";
import { Prediction } from "@/models/Prediction";
import { CustomPoolPrediction } from "@/models/CustomPoolPrediction";
import { BonusAuditLog } from "@/models/BonusAuditLog";
import { User } from "@/models/User";
import { getSettings } from "@/models/Settings";
import { settleCivilWar } from "@/services/civil-war";
import {
  RANK_POINTS,
  PENALTIES,
  BONUSES,
  PREDICTION_POINTS,
} from "@/lib/constants";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

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

type BonusRuntimeConfig = {
  consistency: number;
  kingSlayer: number;
  comeback: number;
  underdog: number;
  matchDomination: number;
  topperDefendsTop: number;
  topperTopsMatch: number;
  captainTeamWin: number;
  leaderTopperBonus: number;
  bounty: number;
  rivalry: number;
  rivalryRevenge: number;
  customBonuses: Array<{
    id: string;
    name: string;
    points: number;
    basis: string;
    action: "add" | "deduct";
    conditionLogic: "all" | "any";
    conditions: Array<{
      conditionType:
        | "fantasy_points_gte"
        | "fantasy_points_lte"
        | "rank_lte"
        | "rank_gte"
        | "leaderboard_climb_gte"
        | "leaderboard_drop_gte"
        | "pre_match_table_pos_lte"
        | "pre_match_table_pos_gte"
        | "post_match_table_pos_lte"
        | "post_match_table_pos_gte"
        | "beat_pre_match_leader_fp"
        | "top_n_by_fantasy_points"
        | "bottom_n_by_fantasy_points"
        | "missed_match"
        | "played_match";
      conditionValue?: number;
    }>;
    active: boolean;
  }>;
};

/**
 * Process all results for a match in one go.
 * Steps:
 *   1. Persist raw results.
 *   2. Calculate base points (rank table) honoring doublePoints / noBonus.
 *   3. Calculate penalties using consecutive-miss history.
 *   4. Calculate bonuses.
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
  // True only the FIRST time this match is published. Edits to an already-
  // entered result will not regenerate facts (admin can use the regenerate
  // button on the admin page when they want a fresh AI pass).
  const isFirstPublish = !match.resultsEntered;
  const bonusConfig = await getBonusRuntimeConfig();

  const doubleMul = match.doublePoints ? 2 : 1;
  const allowBonuses = !match.noBonus;
  const chaos = !!match.chaosMatch;
  const madness = !!match.predictionMadness;
  const bountyId = match.bountyUserId ? String(match.bountyUserId) : null;

  // --- Snapshot leaderboard BEFORE this match (for movement & bonuses) ---
  const prevLb = await computeLeaderboard({ excludeMatchId: matchId });
  const prevRankMap = new Map(prevLb.map((r) => [String(r.userId), r.position]));
  const prevLeaderId = prevLb[0]?.userId ? String(prevLb[0].userId) : null;

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
      const consec = await countConsecutiveMisses(e.userId, match.startTime, matchId);
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
        bountyPoints: 0,
        rivalryPoints: 0,
        civilWarPoints: 0,
        bonuses: [],
        finalPoints: base + penaltyTotal,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    created.push(upsert!);
  }

  // --- Bonuses (need full match snapshot first) ---
  // Clear any prior bonus audit log entries for this match so re-submissions
  // don't accumulate duplicate audit rows.
  await BonusAuditLog.deleteMany({ matchId });
  if (allowBonuses) {
    await applyBonuses({
      matchId,
      results: created,
      prevRankMap,
      prevLeaderId,
      chaos,
      bonusConfig,
    });
  }

  // --- Bounty points (separate bucket, not part of bonuses) ---
  await applyBountyPoints({ matchId, results: created, bountyId, bonusConfig });

  // --- Rivalry points (1v1 challenges) ---
  await settleRivalries({ matchId, results: created, bonusConfig });

  // --- Civil War team scoring (depends on rivalries being settled) ---
  await applyCivilWarPoints({
    matchId,
    results: created,
    prevLeaderboardOrder: prevLb.map((r) => String(r.userId)),
    captainTeamWin: bonusConfig.captainTeamWin,
    leaderTopperBonus: bonusConfig.leaderTopperBonus,
  });

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
  if (predictionResult?.topBatter) {
    match.predictionTopBatter = predictionResult.topBatter;
  }
  if (predictionResult?.topBowler) {
    match.predictionTopBowler = predictionResult.topBowler;
  }
  if (opts.scoreSummary) {
    match.scoreSummary = opts.scoreSummary;
  }
  await match.save();

  // --- Generate storyline facts (background, after the response is sent) ---
  // Only on the FIRST publish — subsequent edits don't regenerate. Admins can
  // trigger a regen manually from the admin page if needed.
  if (isFirstPublish) {
    after(async () => {
      try {
        const { generateFactsForMatch } = await import("@/services/facts");
        await generateFactsForMatch(matchId);
      } catch (err) {
        console.warn("[scoring] background facts generation failed", err);
      }
    });
  }

  // Unlock the rivalry dropdown for any later same-day match that was waiting
  // on this result, and refresh the dashboard so the new storylines show up.
  try {
    revalidatePath("/rivalry");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    revalidatePath(`/matches/${matchId}`);
  } catch {
    // revalidation is best-effort
  }
}

async function countConsecutiveMisses(
  userId: string,
  beforeOrAtDate: Date,
  excludeMatchId: string
): Promise<number> {
  // Look at this user's last few matches up to and including the current one,
  // counting trailing consecutive misses. Excludes the current match's existing
  // MatchResult (if any) so re-submissions don't double-count.
  const recent = await MatchResult.find({
    userId,
    matchId: { $ne: new mongoose.Types.ObjectId(excludeMatchId) },
  })
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
  chaos: boolean;
  bonusConfig: BonusRuntimeConfig;
}) {
  const { matchId, results, prevRankMap, prevLeaderId, chaos, bonusConfig } = args;
  // In Chaos mode, every bonus value is doubled.
  const bonusMul = chaos ? 2 : 1;

  // Sort results by rank (1 best). Skip missed.
  const ranked = [...results].filter((r) => !r.missed && r.rank > 0).sort((a, b) => a.rank - b.rank);
  const top1 = ranked[0];
  const top2 = ranked[1];

  // Match domination: top1 wins by >= 300 fp over top2
  const dominationApplies =
    top1 && top2 && top1.fantasyPoints - top2.fantasyPoints >= 300;

  // Compute "after this match" leaderboard for comeback / king slayer / underdog
  const newLb = await computeLeaderboard();
  const newRankMap = new Map(newLb.map((r) => [String(r.userId), r.position]));

  for (const r of results) {
    const uid = String(r.userId);
    const breakdown: { type: string; points: number; reason: string }[] = [];
    let total = 0;
    const add = (type: string, points: number, reason: string) => {
      const adj = points * bonusMul;
      breakdown.push({ type, points: adj, reason: chaos ? `${reason} (Chaos ×2)` : reason });
      total += adj;
    };

    // Bonus: beat current overall #1 by fantasy points in this match.
    if (prevLeaderId && uid !== prevLeaderId && !r.missed) {
        const leaderRes = results.find((x) => String(x.userId) === prevLeaderId);
        if (leaderRes && !leaderRes.missed && r.fantasyPoints > leaderRes.fantasyPoints) {
          add(
            "king_slayer",
            bonusConfig.kingSlayer,
            "Scored more fantasy points than the player who was overall #1 before this match"
          );
        }
    }

    // Comeback: gained 4+ positions in overall leaderboard
    const prevPos = prevRankMap.get(uid);
    const newPos = newRankMap.get(uid);
    if (prevPos && newPos && prevPos - newPos >= 4) {
      add("comeback", bonusConfig.comeback, `Climbed ${prevPos - newPos} leaderboard positions`);
    }

    // Underdog: was ranked 10-13 overall AND finished top 2
    if (prevPos && prevPos >= 10 && prevPos <= 13 && top1 && top2) {
      const isTop2 = String(top1.userId) === uid || String(top2.userId) === uid;
      if (isTop2) add("underdog", bonusConfig.underdog, `Was overall #${prevPos} and finished top 2`);
    }

    // Match domination: only the winner gets it
    if (dominationApplies && top1 && String(top1.userId) === uid) {
      add(
        "match_domination",
        bonusConfig.matchDomination,
        `Won by ${top1.fantasyPoints - top2.fantasyPoints} Dream11 points`
      );
    }

    // Pre-match leaderboard topper remains #1 after this match.
    if (prevLeaderId && uid === prevLeaderId) {
      const currentPos = newRankMap.get(uid);
      if (currentPos === 1) {
        add(
          "topper_defends_top",
          bonusConfig.topperDefendsTop,
          "Stayed #1 on the overall leaderboard after this match"
        );
      }

      // Pre-match topper also tops this match by fantasy points.
      if (top1 && String(top1.userId) === uid && !r.missed) {
        add(
          "topper_tops_match",
          bonusConfig.topperTopsMatch,
          "Was overall #1 before match and finished #1 in this match by fantasy points"
        );
      }
    }

    // Consistency: 3 consecutive matches in top-5 by fantasy points.
    if (!r.missed) {
      const streak = await countConsecutiveFantasyTop5(uid);
      if (streak >= 3) {
        add("consistency", bonusConfig.consistency, "3 consecutive matches in top 5 by fantasy points");
      }
    }

    for (const custom of bonusConfig.customBonuses) {
      if (!custom.active) continue;
      const ok = await isCustomBonusConditionSatisfied({
        custom,
        result: r,
        results,
        prevRankMap,
        newRankMap,
        prevLeaderId,
      });
      if (!ok) continue;
      const signedPoints = custom.action === "deduct" ? -custom.points : custom.points;
      add(
        `custom_${custom.id}`,
        signedPoints,
        `${custom.name}: ${custom.basis}`
      );
    }

    r.bonusPoints = total;
    r.bonuses = breakdown;
    r.finalPoints = r.basePoints + r.penaltyPoints + total;
    await r.save();

    // Audit log per applied bonus
    for (const b of breakdown.filter((x) => x.points !== 0)) {
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

async function applyBountyPoints(args: {
  matchId: string;
  results: HydratedDocument<IMatchResult>[];
  bountyId: string | null;
  bonusConfig: BonusRuntimeConfig;
}) {
  const { matchId, results, bountyId, bonusConfig } = args;
  if (!bountyId) {
    for (const r of results) {
      if (r.bountyPoints) {
        r.bountyPoints = 0;
        r.finalPoints =
        r.basePoints + r.penaltyPoints + r.bonusPoints + (r.rivalryPoints ?? 0) + (r.civilWarPoints ?? 0);
      }
    }
    return;
  }

  const bountyRes = results.find((x) => String(x.userId) === bountyId);
  for (const r of results) {
    const uid = String(r.userId);
    let bountyPts = 0;
    if (
      uid !== bountyId &&
      !r.missed &&
      bountyRes &&
      !bountyRes.missed &&
      r.rank > 0 &&
      bountyRes.rank > 0 &&
      r.rank < bountyRes.rank
    ) {
      bountyPts = bonusConfig.bounty;
      await BonusAuditLog.create({
        userId: r.userId,
        matchId,
        bonusType: "bounty_match",
        points: bountyPts,
        explanation: "Beat the selected bounty holder for this match",
      });
    }
    r.bountyPoints = bountyPts;
    r.finalPoints =
      r.basePoints + r.penaltyPoints + r.bonusPoints + bountyPts + (r.rivalryPoints ?? 0) + (r.civilWarPoints ?? 0);
    await r.save();
  }
}

async function settleRivalries(args: {
  matchId: string;
  results: HydratedDocument<IMatchResult>[];
  bonusConfig: BonusRuntimeConfig;
}) {
  const { Rivalry } = await import("@/models/Rivalry");
  const { Notification } = await import("@/models/Notification");
  const { matchId, results, bonusConfig } = args;
  const rivalries = await Rivalry.find({ matchId, status: "accepted" });
  if (!rivalries.length) {
    // Nothing to settle, but reset any stale rivalry points on results just in case.
    for (const r of results) {
      if (r.rivalryPoints) {
        r.rivalryPoints = 0;
        r.finalPoints =
          r.basePoints + r.penaltyPoints + r.bonusPoints + (r.bountyPoints ?? 0) + (r.civilWarPoints ?? 0);
        await r.save();
      }
    }
    return;
  }

  const resByUser = new Map(results.map((r) => [String(r.userId), r]));
  // Reset all current rivalry credits before re-applying.
  for (const r of results) {
    r.rivalryPoints = 0;
  }

  for (const riv of rivalries) {
    const cRes = resByUser.get(String(riv.challengerId));
    const oRes = resByUser.get(String(riv.opponentId));
    let winnerId: mongoose.Types.ObjectId | null = null;
    if (cRes && oRes) {
      const cMissed = cRes.missed || cRes.rank === 0;
      const oMissed = oRes.missed || oRes.rank === 0;
      if (cMissed && oMissed) {
        winnerId = null;
      } else if (cMissed) {
        winnerId = riv.opponentId;
      } else if (oMissed) {
        winnerId = riv.challengerId;
      } else if (cRes.rank < oRes.rank) {
        winnerId = riv.challengerId;
      } else if (oRes.rank < cRes.rank) {
        winnerId = riv.opponentId;
      } else {
        winnerId = null;
      }
    }
    riv.settled = true;
    riv.winnerId = winnerId ?? null;

    // Revenge bonus: if the current winner is the LOSER of a previously-settled
    // accepted rivalry between the same pair, award +1 extra point.
    let revengeBonus = 0;
    if (winnerId) {
      const priorLoss = await Rivalry.findOne({
        _id: { $ne: riv._id },
        status: "accepted",
        settled: true,
        $or: [
          { challengerId: riv.challengerId, opponentId: riv.opponentId },
          { challengerId: riv.opponentId, opponentId: riv.challengerId },
        ],
        winnerId: {
          $ne: null,
          // Previous winner must be the player who lost this time
          $eq:
            String(winnerId) === String(riv.challengerId)
              ? riv.opponentId
              : riv.challengerId,
        },
      }).lean();
      if (priorLoss) revengeBonus = bonusConfig.rivalryRevenge;
    }

    riv.pointsAwarded = winnerId ? bonusConfig.rivalry + revengeBonus : 0;
    await riv.save();

    if (winnerId) {
      const winnerRes = resByUser.get(String(winnerId));
      if (winnerRes) {
        winnerRes.rivalryPoints =
          (winnerRes.rivalryPoints ?? 0) + bonusConfig.rivalry + revengeBonus;
        await BonusAuditLog.create({
          userId: winnerId,
          matchId,
          bonusType: revengeBonus ? "rivalry_revenge_win" : "rivalry_win",
          points: bonusConfig.rivalry + revengeBonus,
          explanation: revengeBonus
            ? `Won the revenge rivalry (+${bonusConfig.rivalry} +${revengeBonus} bonus)`
            : "Won a 1v1 rivalry challenge for this match",
        });
      }
      // Notify both players
      const loserId =
        String(winnerId) === String(riv.challengerId) ? riv.opponentId : riv.challengerId;
      await Notification.create({
        userId: winnerId,
        title: revengeBonus ? "Revenge won \ud83c\udfc6" : "Rivalry won \ud83c\udfc6",
        body: revengeBonus
          ? `You won the revenge match (+${bonusConfig.rivalry + revengeBonus} points).`
          : `You beat your rival this match (+${bonusConfig.rivalry} points).`,
      });
      await Notification.create({
        userId: loserId,
        title: "Rivalry lost",
        body: revengeBonus
          ? "Your rival took the revenge match."
          : "Your rival finished above you this match.",
      });
    } else {
      // No winner (tie or both missed) - notify both as a draw
      await Notification.create({
        userId: riv.challengerId,
        title: "Rivalry tied",
        body: "Your 1v1 rivalry ended in a tie this match.",
      });
      await Notification.create({
        userId: riv.opponentId,
        title: "Rivalry tied",
        body: "Your 1v1 rivalry ended in a tie this match.",
      });
    }
  }

  // Persist updated final points for every result (rivalry points may have changed).
  for (const r of results) {
    r.finalPoints =
      r.basePoints + r.penaltyPoints + r.bonusPoints + (r.bountyPoints ?? 0) + (r.rivalryPoints ?? 0) + (r.civilWarPoints ?? 0);
    await r.save();
  }
}

async function applyCivilWarPoints(args: {
  matchId: string;
  results: HydratedDocument<IMatchResult>[];
  prevLeaderboardOrder: string[];
  captainTeamWin: number;
  leaderTopperBonus: number;
}) {
  const { Rivalry } = await import("@/models/Rivalry");
  const { matchId, results } = args;

  // Reset civil war points on all results first (idempotent re-runs).
  for (const r of results) {
    if (r.civilWarPoints) {
      r.civilWarPoints = 0;
    }
  }

  const rivalries = await Rivalry.find({ matchId, status: "accepted" })
    .select("_id winnerId settled")
    .lean();

  const pointMap = await settleCivilWar({
    matchId,
    matchResults: results.map((r) => ({
      userId: r.userId as mongoose.Types.ObjectId,
      fantasyPoints: r.fantasyPoints,
      missed: r.missed,
    })),
    rivalries: rivalries.map((r) => ({
      _id: r._id as mongoose.Types.ObjectId,
      winnerId: r.winnerId ?? null,
      settled: !!r.settled,
    })),
    prevLeaderboardOrder: args.prevLeaderboardOrder,
    captainTeamWin: args.captainTeamWin,
    leaderTopperBonus: args.leaderTopperBonus,
  });

  for (const r of results) {
    const pts = pointMap.get(String(r.userId)) ?? 0;
    r.civilWarPoints = pts;
    r.finalPoints =
      r.basePoints +
      r.penaltyPoints +
      r.bonusPoints +
      (r.bountyPoints ?? 0) +
      (r.rivalryPoints ?? 0) +
      (r.civilWarPoints ?? 0);
    await r.save();
  }
}

async function countConsecutiveFantasyTop5(userId: string): Promise<number> {
  const recent = await MatchResult.find({ userId })
    .populate({ path: "matchId", select: "startTime", model: Match })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const sorted = recent.sort((a, b) => {
    const ad = (a.matchId as unknown as { startTime: Date })?.startTime?.getTime() ?? 0;
    const bd = (b.matchId as unknown as { startTime: Date })?.startTime?.getTime() ?? 0;
    return bd - ad;
  });

  let count = 0;
  for (const r of sorted) {
    if (r.missed) break;

    // Top-5 check is based on fantasy points only.
    const betterCount = await MatchResult.countDocuments({
      matchId: r.matchId,
      missed: false,
      fantasyPoints: { $gt: r.fantasyPoints },
    });

    if (betterCount <= 4) {
      count++;
      continue;
    }

    break;
  }

  return count;
}

async function getBonusRuntimeConfig(): Promise<BonusRuntimeConfig> {
  const settings = await getSettings();
  const cfg = settings.bonusConfig ?? {};
  const legacyNeedsValue = (type: string) =>
    type !== "beat_pre_match_leader_fp" && type !== "missed_match" && type !== "played_match";

  const normalizedCustom = (settings.customBonuses ?? []).map((b) => {
    const asNew = b as unknown as {
      conditions?: Array<{ conditionType: string; conditionValue?: number }>;
      conditionLogic?: "all" | "any";
      action?: "add" | "deduct";
      conditionType?: string;
      conditionValue?: number;
    };
    const conditions =
      asNew.conditions && asNew.conditions.length
        ? asNew.conditions.map((c) => ({
            conditionType: c.conditionType as BonusRuntimeConfig["customBonuses"][number]["conditions"][number]["conditionType"],
            conditionValue: legacyNeedsValue(c.conditionType) ? c.conditionValue : undefined,
          }))
        : [
            {
              conditionType: (asNew.conditionType ?? "fantasy_points_gte") as BonusRuntimeConfig["customBonuses"][number]["conditions"][number]["conditionType"],
              conditionValue: legacyNeedsValue(asNew.conditionType ?? "fantasy_points_gte")
                ? asNew.conditionValue
                : undefined,
            },
          ];

    return {
      id: b.id,
      name: b.name,
      points: b.points,
      basis: b.basis,
      action: asNew.action ?? "add",
      conditionLogic: asNew.conditionLogic ?? "all",
      conditions,
      active: b.active,
    };
  });

  return {
    consistency: cfg.consistency ?? BONUSES.CONSISTENCY,
    kingSlayer: cfg.kingSlayer ?? BONUSES.KING_SLAYER,
    comeback: cfg.comeback ?? BONUSES.COMEBACK,
    underdog: cfg.underdog ?? BONUSES.UNDERDOG,
    matchDomination: cfg.matchDomination ?? BONUSES.MATCH_DOMINATION,
    topperDefendsTop: cfg.topperDefendsTop ?? BONUSES.TOPPER_DEFENDS_TOP,
    topperTopsMatch: cfg.topperTopsMatch ?? BONUSES.TOPPER_TOPS_MATCH,
    captainTeamWin: cfg.captainTeamWin ?? BONUSES.CAPTAIN_TEAM_WIN,
    leaderTopperBonus: cfg.leaderTopperBonus ?? BONUSES.LEADER_TOPPER_BONUS,
    bounty: cfg.bounty ?? BONUSES.BOUNTY,
    rivalry: cfg.rivalry ?? BONUSES.RIVALRY,
    rivalryRevenge: cfg.rivalryRevenge ?? 1,
    customBonuses: normalizedCustom
      .filter((b) => b.active)
      .map((b) => ({
        id: b.id,
        name: b.name,
        points: b.points,
        basis: b.basis,
        action: b.action,
        conditionLogic: b.conditionLogic,
        conditions: b.conditions,
        active: b.active,
      })),
  };
}

async function isCustomBonusConditionSatisfied(args: {
  custom: BonusRuntimeConfig["customBonuses"][number];
  result: HydratedDocument<IMatchResult>;
  results: HydratedDocument<IMatchResult>[];
  prevRankMap: Map<string, number>;
  newRankMap: Map<string, number>;
  prevLeaderId: string | null;
}): Promise<boolean> {
  const { custom, result, results, prevRankMap, newRankMap, prevLeaderId } = args;
  const uid = String(result.userId);

  const evaluateCondition = async (
    condition: BonusRuntimeConfig["customBonuses"][number]["conditions"][number]
  ) => {
    const n = condition.conditionValue ?? 0;
    switch (condition.conditionType) {
      case "fantasy_points_gte":
        return !result.missed && result.fantasyPoints >= n;
      case "fantasy_points_lte":
        return !result.missed && result.fantasyPoints <= n;
      case "rank_lte":
        return !result.missed && result.rank > 0 && result.rank <= n;
      case "rank_gte":
        return !result.missed && result.rank > 0 && result.rank >= n;
      case "leaderboard_climb_gte": {
        const prevPos = prevRankMap.get(uid);
        const newPos = newRankMap.get(uid);
        return !!(prevPos && newPos && prevPos - newPos >= n);
      }
      case "leaderboard_drop_gte": {
        const prevPos = prevRankMap.get(uid);
        const newPos = newRankMap.get(uid);
        return !!(prevPos && newPos && newPos - prevPos >= n);
      }
      case "pre_match_table_pos_lte": {
        const prevPos = prevRankMap.get(uid);
        return !!prevPos && prevPos <= n;
      }
      case "pre_match_table_pos_gte": {
        const prevPos = prevRankMap.get(uid);
        return !!prevPos && prevPos >= n;
      }
      case "post_match_table_pos_lte": {
        const pos = newRankMap.get(uid);
        return !!pos && pos <= n;
      }
      case "post_match_table_pos_gte": {
        const pos = newRankMap.get(uid);
        return !!pos && pos >= n;
      }
      case "beat_pre_match_leader_fp": {
        if (!prevLeaderId || uid === prevLeaderId || result.missed) return false;
        const leaderRes = results.find((x) => String(x.userId) === prevLeaderId);
        return !!leaderRes && !leaderRes.missed && result.fantasyPoints > leaderRes.fantasyPoints;
      }
      case "top_n_by_fantasy_points": {
        if (result.missed) return false;
        const betterCount = await MatchResult.countDocuments({
          matchId: result.matchId,
          missed: false,
          fantasyPoints: { $gt: result.fantasyPoints },
        });
        return betterCount < Math.max(1, n);
      }
      case "bottom_n_by_fantasy_points": {
        if (result.missed) return false;
        const betterCount = await MatchResult.countDocuments({
          matchId: result.matchId,
          missed: false,
          fantasyPoints: { $gt: result.fantasyPoints },
        });
        const totalPlayed = results.filter((x) => !x.missed && x.rank > 0).length;
        const rankByFp = betterCount + 1;
        return rankByFp >= Math.max(1, totalPlayed - Math.max(1, n) + 1);
      }
      case "missed_match":
        return result.missed;
      case "played_match":
        return !result.missed;
      default:
        return false;
    }
  };

  const checks = await Promise.all(custom.conditions.map((c) => evaluateCondition(c)));
  return custom.conditionLogic === "any" ? checks.some(Boolean) : checks.every(Boolean);
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
        bountyPoints: { $sum: "$bountyPoints" },
        rivalryPoints: { $sum: "$rivalryPoints" },
        civilWarPoints: { $sum: "$civilWarPoints" },
        penaltyPoints: { $sum: "$penaltyPoints" },
        matches: { $sum: 1 },
        wins: { $sum: { $cond: [{ $eq: ["$rank", 1] }, 1, 0] } },
        silver: { $sum: { $cond: [{ $eq: ["$rank", 2] }, 1, 0] } },
        bronze: { $sum: { $cond: [{ $eq: ["$rank", 3] }, 1, 0] } },
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

  // rivalry withdrawal penalties (per user)
  const { Rivalry: RivalryModel } = await import("@/models/Rivalry");
  const withdrawAgg = await RivalryModel.aggregate([
    { $match: { status: "cancelled", cancelledBy: { $ne: null } } },
    { $group: { _id: "$cancelledBy", penalty: { $sum: "$pointsPenalty" } } },
  ]);
  const withdrawMap = new Map(
    withdrawAgg.map((w: { _id: unknown; penalty: number }) => [String(w._id), w.penalty])
  );

  const users = await User.find().lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const merged = results.map((r) => {
    const u = userMap.get(String(r._id));
    const ranks = (r.ranks as (number | null)[]).filter((x): x is number => !!x);
    const avg = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
    const pred = predMap.get(String(r._id)) ?? 0;
    const pool = poolMap.get(String(r._id)) ?? 0;
    const withdraw = withdrawMap.get(String(r._id)) ?? 0;
    return {
      userId: r._id,
      username: u?.username ?? "Unknown",
      handle: u?.userId ?? "",
      avatar: u?.avatar ?? null,
      totalPoints: (r.totalPoints as number) + pred + pool - withdraw,
      leaguePoints: r.basePoints as number,
      predictionPoints: pred + pool,
      customPoolPoints: pool,
      basePoints: r.basePoints as number,
      bonusPoints: r.bonusPoints as number,
      bountyPoints: (r.bountyPoints as number) ?? 0,
      rivalryPoints: (r.rivalryPoints as number) ?? 0,
      civilWarPoints: (r.civilWarPoints as number) ?? 0,
      rivalryWithdrawPenalty: withdraw,
      penaltyPoints: r.penaltyPoints as number,
      matches: r.matches as number,
      wins: r.wins as number,
      silver: (r.silver as number) ?? 0,
      bronze: (r.bronze as number) ?? 0,
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
      const withdraw = withdrawMap.get(String(u._id)) ?? 0;
      merged.push({
        userId: u._id,
        username: u.username,
        handle: u.userId,
        avatar: u.avatar ?? null,
        totalPoints: pred + pool - withdraw,
        leaguePoints: 0,
        predictionPoints: pred + pool,
        customPoolPoints: pool,
        basePoints: 0,
        bonusPoints: 0,
        bountyPoints: 0,
        rivalryPoints: 0,
        civilWarPoints: 0,
        rivalryWithdrawPenalty: withdraw,
        penaltyPoints: 0,
        matches: 0,
        wins: 0,
        silver: 0,
        bronze: 0,
        top3: 0,
        top5: 0,
        missed: 0,
        averageFinish: 0,
      });
    }
  }

  merged.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.username.localeCompare(b.username);
  });

  let lastPoints: number | null = null;
  let position = 0;
  return merged.map((r, i) => {
    if (lastPoints === null || r.totalPoints < lastPoints) {
      position = i + 1;
      lastPoints = r.totalPoints;
    }
    return { ...r, position };
  });
}

export type LeaderboardRow = Awaited<ReturnType<typeof computeLeaderboard>>[number];
