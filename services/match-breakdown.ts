/**
 * Canonical per-match points breakdown — one shape, consumed by every UI
 * that needs to render how a user's points were earned (profile, leaderboard
 * drilldown, charts, exports).
 *
 * Adding a new contribution in the future = one new entry in `LINE_BUILDERS`
 * (or splice an extra line into a builder's output). UIs render whatever
 * lines they get and never hardcode the list.
 */
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";
import { CustomPool } from "@/models/CustomPool";
import { CustomPoolPrediction } from "@/models/CustomPoolPrediction";
import { loadCivilWarBreakdowns } from "@/lib/civil-war-breakdown";
import { PREDICTION_POINTS } from "@/lib/constants";

export type LineGroup =
  | "rank"
  | "bonus"
  | "bounty"
  | "rivalry"
  | "civil_war"
  | "captain"
  | "prediction"
  | "custom_pool"
  | "penalty";

/**
 * One row in the breakdown. Signed `points` — positive = credit, negative =
 * debit. UIs filter out `points === 0` unless the row is `alwaysShow`.
 */
export interface MatchPointsLine {
  /** Stable key, e.g. "rank.base", "bonus.KING_SLAYER", "pool.<poolId>". */
  key: string;
  group: LineGroup;
  label: string;
  points: number;
  /** Small dimmed sub-text, e.g. "Picked Yes \u00b7 Correct: No". */
  detail?: string;
  /** Tooltip-style hint, e.g. "+4 per option, +1 all-three bonus". */
  hint?: string;
  /** Render even when points === 0 (e.g. an incorrect prediction). */
  alwaysShow?: boolean;
}

export interface SpecialMatchFlag {
  key: "doublePoints" | "chaosMatch" | "noBonus" | "predictionMadness";
  label: string;
  /** Short explainer shown under the chip. */
  effect: string;
}

export interface MatchPointsBreakdown {
  matchId: string;
  match: {
    teamA: string;
    teamB: string;
    startTime: Date;
    matchWinner: string | null;
    stage: string | null;
  };
  /** 1..13, 0 if missed/no result yet. */
  rank: number;
  /** Raw Dream11 fantasy points scored on my11. */
  fantasyPoints: number;
  missed: boolean;
  /** Active special-match modes for this match (only enabled ones included). */
  specials: SpecialMatchFlag[];
  /** Ordered list of every signed contribution. */
  lines: MatchPointsLine[];
  /** Sum of every line's `points`. */
  total: number;
}

const GROUP_ORDER: LineGroup[] = [
  "rank",
  "bonus",
  "bounty",
  "rivalry",
  "civil_war",
  "captain",
  "prediction",
  "custom_pool",
  "penalty",
];

const SPECIAL_LABELS: Record<SpecialMatchFlag["key"], { label: string; effect: string }> = {
  doublePoints: {
    label: "\u00d72 Double points",
    effect: "Base rank points doubled",
  },
  chaosMatch: {
    label: "\u26a1 Chaos match",
    effect: "Inverted bonus pool — underdogs rewarded",
  },
  noBonus: {
    label: "\ud83d\udeab No bonus",
    effect: "Bonus pool disabled for this match",
  },
  predictionMadness: {
    label: "\ud83c\udfaf Prediction madness",
    effect: "Prediction points doubled",
  },
};

/**
 * Build the canonical breakdown for one user across many matches. Single
 * round-trip per collection so this is cheap even for full season views.
 */
export async function buildMatchBreakdowns(
  userId: string,
  matchIds: string[],
): Promise<Map<string, MatchPointsBreakdown>> {
  await connectDB();
  const out = new Map<string, MatchPointsBreakdown>();
  if (!matchIds.length) return out;

  const [matches, results, predictions, poolPreds] = await Promise.all([
    Match.find({ _id: { $in: matchIds } }).lean(),
    MatchResult.find({ userId, matchId: { $in: matchIds } }).lean(),
    Prediction.find({ userId, matchId: { $in: matchIds }, scored: true }).lean(),
    CustomPoolPrediction.find({
      userId,
      matchId: { $in: matchIds },
      scored: true,
    }).lean(),
  ]);

  const poolIds = Array.from(new Set(poolPreds.map((p) => String(p.poolId))));
  const poolDocs = poolIds.length
    ? await CustomPool.find({ _id: { $in: poolIds } })
        .select("question correctOption pointsValue matchId")
        .lean()
    : [];
  const poolById = new Map(poolDocs.map((p) => [String(p._id), p]));

  const cwBreakdowns = await loadCivilWarBreakdowns(userId, matchIds);

  const resultByMatch = new Map(results.map((r) => [String(r.matchId), r]));
  const predByMatch = new Map(predictions.map((p) => [String(p.matchId), p]));
  const poolsByMatch = new Map<string, typeof poolPreds>();
  for (const pp of poolPreds) {
    const mid = String(pp.matchId);
    const arr = poolsByMatch.get(mid) ?? [];
    arr.push(pp);
    poolsByMatch.set(mid, arr);
  }

  for (const m of matches) {
    const mid = String(m._id);
    const r = resultByMatch.get(mid);
    const pred = predByMatch.get(mid);
    const pools = poolsByMatch.get(mid) ?? [];
    const cw = cwBreakdowns.get(mid);

    const specials: SpecialMatchFlag[] = [];
    for (const key of [
      "doublePoints",
      "chaosMatch",
      "noBonus",
      "predictionMadness",
    ] as const) {
      if (m[key]) specials.push({ key, ...SPECIAL_LABELS[key] });
    }

    const lines: MatchPointsLine[] = [];

    // ---- Rank (league core) -----------------------------------------------
    if (r && !r.missed && r.basePoints !== 0) {
      lines.push({
        key: "rank.base",
        group: "rank",
        label: `Rank #${r.rank} points`,
        points: r.basePoints,
        hint: m.doublePoints ? "Doubled by \u00d72 mode" : undefined,
      });
    }

    // ---- Bonuses ----------------------------------------------------------
    for (const b of r?.bonuses ?? []) {
      if (b.points === 0) continue;
      lines.push({
        key: `bonus.${b.type}`,
        group: "bonus",
        label: b.reason || b.type,
        points: b.points,
      });
    }

    // ---- Bounty -----------------------------------------------------------
    if (r?.bountyPoints) {
      lines.push({
        key: "bounty",
        group: "bounty",
        label: "Match bounty",
        points: r.bountyPoints,
      });
    }

    // ---- Rivalry ----------------------------------------------------------
    if (r?.rivalryPoints) {
      lines.push({
        key: "rivalry",
        group: "rivalry",
        label: r.rivalryPoints > 0 ? "Rivalry win" : "Rivalry loss",
        points: r.rivalryPoints,
      });
    }

    // ---- Civil War (base + captain duel split) ----------------------------
    if (cw && cw.base !== 0) {
      lines.push({
        key: "cw.base",
        group: "civil_war",
        label: cw.outcomeLabel
          ? `Civil War (${cw.outcomeLabel})`
          : "Civil War",
        points: cw.base,
      });
    }
    if (cw && cw.captainBonus > 0) {
      lines.push({
        key: "cw.captain",
        group: "captain",
        label: "Captain duel win",
        points: cw.captainBonus,
      });
    }

    // ---- Predictions ------------------------------------------------------
    if (pred) {
      const winPts = pred.correctWinner ? PREDICTION_POINTS.WINNER : 0;
      const batPts = pred.correctBatter ? PREDICTION_POINTS.TOP_BATTER : 0;
      const bowlPts = pred.correctBowler ? PREDICTION_POINTS.TOP_BOWLER : 0;
      const allPts = pred.allThreeBonus ? PREDICTION_POINTS.ALL_THREE_BONUS : 0;
      const madnessMul = m.predictionMadness ? 2 : 1;
      if (winPts || pred.winner) {
        lines.push({
          key: "pred.winner",
          group: "prediction",
          label: "Winner",
          detail: `Picked ${pred.winner}`,
          points: winPts * madnessMul,
          alwaysShow: !winPts,
        });
      }
      if (batPts || pred.topBatter) {
        lines.push({
          key: "pred.batter",
          group: "prediction",
          label: "Top batter",
          detail: `Picked ${pred.topBatter}`,
          points: batPts * madnessMul,
          alwaysShow: !batPts,
        });
      }
      if (bowlPts || pred.topBowler) {
        lines.push({
          key: "pred.bowler",
          group: "prediction",
          label: "Top bowler",
          detail: `Picked ${pred.topBowler}`,
          points: bowlPts * madnessMul,
          alwaysShow: !bowlPts,
        });
      }
      if (allPts) {
        lines.push({
          key: "pred.all3",
          group: "prediction",
          label: "All-three sweep",
          points: allPts * madnessMul,
        });
      }
    }

    // ---- Custom pools -----------------------------------------------------
    for (const pp of pools) {
      const pool = poolById.get(String(pp.poolId));
      const question = pool?.question ?? "(deleted pool)";
      const correct = pool?.correctOption ?? null;
      const detailParts = [`Picked ${pp.choice}`];
      if (!pp.correct && correct) detailParts.push(`Correct: ${correct}`);
      lines.push({
        key: `pool.${String(pp.poolId)}`,
        group: "custom_pool",
        label: question,
        detail: detailParts.join(" \u00b7 "),
        points: pp.pointsAwarded ?? 0,
        alwaysShow: !pp.correct,
      });
    }

    // ---- Penalties --------------------------------------------------------
    for (const p of r?.penalties ?? []) {
      if (p.points === 0) continue;
      lines.push({
        key: `penalty.${p.type}`,
        group: "penalty",
        label: p.reason || p.type,
        points: p.points,
      });
    }

    // Stable ordering by group then original insertion order
    lines.sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
    );

    const total = lines.reduce((s, l) => s + l.points, 0);

    out.set(mid, {
      matchId: mid,
      match: {
        teamA: m.teamA,
        teamB: m.teamB,
        startTime: m.startTime,
        matchWinner: m.matchWinner ?? null,
        stage: m.stage ?? null,
      },
      rank: r?.rank ?? 0,
      fantasyPoints: r?.fantasyPoints ?? 0,
      missed: !!r?.missed,
      specials,
      lines,
      total,
    });
  }

  return out;
}

/**
 * Aggregate signed totals per group — useful for stacked bar charts.
 */
export function groupTotals(breakdown: MatchPointsBreakdown): Record<LineGroup, number> {
  const acc = {
    rank: 0,
    bonus: 0,
    bounty: 0,
    rivalry: 0,
    civil_war: 0,
    captain: 0,
    prediction: 0,
    custom_pool: 0,
    penalty: 0,
  } satisfies Record<LineGroup, number>;
  for (const l of breakdown.lines) acc[l.group] += l.points;
  return acc;
}
