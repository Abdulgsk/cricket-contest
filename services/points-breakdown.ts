/**
 * Aggregates every discrete way a user has earned (or lost) points across
 * their full season, broken down by category. Used by the analytics + profile
 * "Points by source" cards.
 */
import { connectDB } from "@/lib/db";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";
import { CustomPoolPrediction } from "@/models/CustomPoolPrediction";
import { loadCivilWarBreakdowns } from "@/lib/civil-war-breakdown";
import { BONUSES, PENALTIES, PREDICTION_POINTS } from "@/lib/constants";

export type PointsBucket = {
  key: string;
  label: string;
  hint?: string;
  points: number;
  count: number;
};

export type PointsBreakdown = {
  groups: {
    key: "league" | "bonus" | "civil_war" | "prediction" | "custom_pool" | "penalty";
    label: string;
    total: number;
    buckets: PointsBucket[];
  }[];
  totals: {
    league: number;
    prediction: number;
    bonus: number;
    civilWar: number;
    customPool: number;
    penalty: number;
    grand: number;
  };
  meta: {
    matchesPlayed: number;
    matchesMissed: number;
  };
};

const BONUS_LABELS: Record<string, { label: string; hint?: string }> = {
  CONSISTENCY: { label: "Consistency", hint: "3 straight top-5 fantasy finishes" },
  KING_SLAYER: { label: "King Slayer", hint: "Beat the overall #1 on FP" },
  COMEBACK: { label: "Comeback", hint: "+4 leaderboard spots after a match" },
  UNDERDOG: { label: "Underdog", hint: "Bottom 4 finishing top 2" },
  MATCH_DOMINATION: { label: "Match Domination", hint: "Win by 100+ FP" },
  TOPPER_DEFENDS_TOP: { label: "Topper defends #1", hint: "Pre-match #1 stays #1" },
  TOPPER_TOPS_MATCH: { label: "Topper tops match", hint: "Pre-match #1 also wins FP" },
  CAPTAIN_TEAM_WIN: { label: "Captain duel win", hint: "Your side's captain beats theirs" },
  LEADER_TOPPER_BONUS: { label: "Leader topper", hint: "Overall #1 beats both CW captains" },
};

const PENALTY_LABELS: Record<string, { label: string; hint?: string }> = {
  MISSED_MATCH: { label: "Missed match", hint: `${PENALTIES.MISSED_MATCH} per missed match` },
  TWO_CONSECUTIVE_MISSES_EXTRA: {
    label: "2nd consecutive miss",
    hint: `Extra ${PENALTIES.TWO_CONSECUTIVE_MISSES_EXTRA}`,
  },
  THREE_CONSECUTIVE_MISSES_EXTRA: {
    label: "3rd consecutive miss",
    hint: `Extra ${PENALTIES.THREE_CONSECUTIVE_MISSES_EXTRA}`,
  },
};

export async function getPointsBreakdown(userId: string): Promise<PointsBreakdown> {
  await connectDB();
  const [results, predictions, poolPicks] = await Promise.all([
    MatchResult.find({ userId }).lean(),
    Prediction.find({ userId, scored: true }).lean(),
    CustomPoolPrediction.find({ userId, scored: true }).lean(),
  ]);

  const matchIds = results.map((r) => String(r.matchId));
  const cwBreakdowns = await loadCivilWarBreakdowns(String(userId), matchIds);

  // ---- League core --------------------------------------------------------
  let baseTotal = 0;
  let baseCount = 0;
  let bountyTotal = 0;
  let bountyCount = 0;
  let rivalryTotal = 0;
  let rivalryCount = 0;
  const bonusByType = new Map<string, { points: number; count: number }>();
  const penaltyByType = new Map<string, { points: number; count: number }>();
  let civilWarBaseTotal = 0;
  let civilWarBaseWins = 0;
  let civilWarBaseLosses = 0;
  let civilWarCaptainTotal = 0;
  let civilWarCaptainCount = 0;
  let matchesPlayed = 0;
  let matchesMissed = 0;

  for (const r of results) {
    if (r.missed) {
      matchesMissed++;
    } else {
      matchesPlayed++;
      if (r.basePoints > 0) {
        baseTotal += r.basePoints;
        baseCount++;
      }
    }
    if (r.bountyPoints > 0) {
      bountyTotal += r.bountyPoints;
      bountyCount++;
    }
    if (r.rivalryPoints > 0) {
      rivalryTotal += r.rivalryPoints;
      rivalryCount++;
    }
    for (const b of r.bonuses ?? []) {
      if (!b.points) continue;
      const cur = bonusByType.get(b.type) ?? { points: 0, count: 0 };
      cur.points += b.points;
      cur.count += 1;
      bonusByType.set(b.type, cur);
    }
    for (const p of r.penalties ?? []) {
      if (!p.points) continue;
      const cur = penaltyByType.get(p.type) ?? { points: 0, count: 0 };
      cur.points += p.points;
      cur.count += 1;
      penaltyByType.set(p.type, cur);
    }
    const cw = cwBreakdowns.get(String(r.matchId));
    if (cw) {
      civilWarBaseTotal += cw.base;
      if (cw.base > 0) civilWarBaseWins++;
      else if (cw.base < 0) civilWarBaseLosses++;
      if (cw.captainBonus > 0) {
        civilWarCaptainTotal += cw.captainBonus;
        civilWarCaptainCount++;
      }
    }
  }

  // ---- Predictions --------------------------------------------------------
  let predWinner = { points: 0, count: 0 };
  let predBatter = { points: 0, count: 0 };
  let predBowler = { points: 0, count: 0 };
  let predAllThree = { points: 0, count: 0 };
  for (const p of predictions) {
    if (p.correctWinner) {
      predWinner.points += PREDICTION_POINTS.WINNER;
      predWinner.count++;
    }
    if (p.correctBatter) {
      predBatter.points += PREDICTION_POINTS.TOP_BATTER;
      predBatter.count++;
    }
    if (p.correctBowler) {
      predBowler.points += PREDICTION_POINTS.TOP_BOWLER;
      predBowler.count++;
    }
    if (p.allThreeBonus) {
      predAllThree.points += PREDICTION_POINTS.ALL_THREE_BONUS;
      predAllThree.count++;
    }
  }

  // ---- Custom pools (admin-defined per-match side bets) ------------------
  let poolCorrect = { points: 0, count: 0 };
  let poolWrong = 0;
  for (const p of poolPicks) {
    if (p.correct && p.pointsAwarded > 0) {
      poolCorrect.points += p.pointsAwarded;
      poolCorrect.count += 1;
    } else if (p.correct === false) {
      poolWrong += 1;
    }
  }

  // ---- Build groups -------------------------------------------------------
  const leagueBuckets: PointsBucket[] = [];
  if (baseCount > 0 || matchesPlayed > 0) {
    leagueBuckets.push({
      key: "rank",
      label: "My11 rank points",
      hint: "Per-match base from your rank table",
      points: baseTotal,
      count: baseCount,
    });
  }
  if (bountyTotal > 0) {
    leagueBuckets.push({
      key: "bounty",
      label: "Match bounties",
      hint: `+${BONUSES.BOUNTY} per bounty claimed`,
      points: bountyTotal,
      count: bountyCount,
    });
  }
  if (rivalryTotal > 0) {
    leagueBuckets.push({
      key: "rivalry",
      label: "Rivalry wins",
      hint: `+${BONUSES.RIVALRY} per 1v1 won`,
      points: rivalryTotal,
      count: rivalryCount,
    });
  }
  const leagueTotal = leagueBuckets.reduce((s, b) => s + b.points, 0);

  const bonusBuckets: PointsBucket[] = Array.from(bonusByType.entries())
    .filter(([type]) => !["CAPTAIN_TEAM_WIN", "LEADER_TOPPER_BONUS"].includes(type))
    .map(([type, v]) => ({
      key: type,
      label: BONUS_LABELS[type]?.label ?? type,
      hint: BONUS_LABELS[type]?.hint,
      points: v.points,
      count: v.count,
    }))
    .sort((a, b) => b.points - a.points);
  const bonusTotal = bonusBuckets.reduce((s, b) => s + b.points, 0);

  const civilWarBuckets: PointsBucket[] = [];
  if (civilWarBaseTotal !== 0 || civilWarBaseWins + civilWarBaseLosses > 0) {
    civilWarBuckets.push({
      key: "cw_base",
      label: "Civil War (team)",
      hint: `${civilWarBaseWins}W / ${civilWarBaseLosses}L outcomes`,
      points: civilWarBaseTotal,
      count: civilWarBaseWins + civilWarBaseLosses,
    });
  }
  if (civilWarCaptainTotal > 0) {
    civilWarBuckets.push({
      key: "cw_captain",
      label: "Captain duel win",
      hint: `+${BONUSES.CAPTAIN_TEAM_WIN} per team-mate, including captain`,
      points: civilWarCaptainTotal,
      count: civilWarCaptainCount,
    });
  }
  const civilWarTotal = civilWarBuckets.reduce((s, b) => s + b.points, 0);

  const predictionBuckets: PointsBucket[] = [];
  if (predWinner.count) {
    predictionBuckets.push({
      key: "pred_winner",
      label: "Predicted winner",
      hint: `+${PREDICTION_POINTS.WINNER} each`,
      points: predWinner.points,
      count: predWinner.count,
    });
  }
  if (predBatter.count) {
    predictionBuckets.push({
      key: "pred_batter",
      label: "Top batter",
      hint: `+${PREDICTION_POINTS.TOP_BATTER} each`,
      points: predBatter.points,
      count: predBatter.count,
    });
  }
  if (predBowler.count) {
    predictionBuckets.push({
      key: "pred_bowler",
      label: "Top bowler",
      hint: `+${PREDICTION_POINTS.TOP_BOWLER} each`,
      points: predBowler.points,
      count: predBowler.count,
    });
  }
  if (predAllThree.count) {
    predictionBuckets.push({
      key: "pred_all3",
      label: "All-three sweep",
      hint: `+${PREDICTION_POINTS.ALL_THREE_BONUS} each`,
      points: predAllThree.points,
      count: predAllThree.count,
    });
  }
  const predictionTotal = predictionBuckets.reduce((s, b) => s + b.points, 0);

  const penaltyBuckets: PointsBucket[] = Array.from(penaltyByType.entries())
    .map(([type, v]) => ({
      key: type,
      label: PENALTY_LABELS[type]?.label ?? type,
      hint: PENALTY_LABELS[type]?.hint,
      points: v.points,
      count: v.count,
    }))
    .sort((a, b) => a.points - b.points);
  const penaltyTotal = penaltyBuckets.reduce((s, b) => s + b.points, 0);

  const customPoolBuckets: PointsBucket[] = [];
  if (poolCorrect.count > 0) {
    customPoolBuckets.push({
      key: "pool_correct",
      label: "Correct side-bets",
      hint: poolWrong > 0 ? `${poolWrong} wrong pick${poolWrong === 1 ? "" : "s"}` : "Per-match admin pools",
      points: poolCorrect.points,
      count: poolCorrect.count,
    });
  }
  const customPoolTotal = customPoolBuckets.reduce((s, b) => s + b.points, 0);

  return {
    groups: [
      { key: "league", label: "League core", total: leagueTotal, buckets: leagueBuckets },
      { key: "bonus", label: "Bonuses", total: bonusTotal, buckets: bonusBuckets },
      { key: "civil_war", label: "Civil War", total: civilWarTotal, buckets: civilWarBuckets },
      { key: "prediction", label: "Predictions", total: predictionTotal, buckets: predictionBuckets },
      { key: "custom_pool", label: "Custom pools", total: customPoolTotal, buckets: customPoolBuckets },
      { key: "penalty", label: "Penalties", total: penaltyTotal, buckets: penaltyBuckets },
    ],
    totals: {
      league: leagueTotal,
      prediction: predictionTotal,
      bonus: bonusTotal,
      civilWar: civilWarTotal,
      customPool: customPoolTotal,
      penalty: penaltyTotal,
      grand: leagueTotal + bonusTotal + civilWarTotal + predictionTotal + customPoolTotal + penaltyTotal,
    },
    meta: { matchesPlayed, matchesMissed },
  };
}
