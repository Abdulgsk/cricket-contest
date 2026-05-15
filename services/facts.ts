import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";
import { DailyFact } from "@/models/DailyFact";
import { Rivalry } from "@/models/Rivalry";
import { User } from "@/models/User";
import { BonusAuditLog } from "@/models/BonusAuditLog";
import { UserMatchTeam } from "@/models/UserMatchTeam";
import { computeLeaderboard } from "@/services/scoring";
import { buildAnalyzerSnapshot } from "@/services/facts-analyzer";
import { buildAiInput, generateAiFacts } from "@/services/facts-ai";
import { revalidatePath } from "next/cache";

interface Fact {
  text: string;
  type: string;
  score: number;
  userId?: string;
}

/**
 * Generate narrative storyline facts for a just-scored match and persist them.
 * Called automatically from processMatchResults() once results are entered.
 *
 * The Gemini-backed narrator (services/facts-ai.ts) is the SOLE generator.
 * We gather every relevant data point — match results, per-user metrics,
 * leaderboard changes, predictions, rivalries, bounty, next match — into a
 * verified payload, hand it to the model, and validate that every number it
 * emits came from that payload. No deterministic if/else fact branches.
 */
export async function generateFactsForMatch(matchId: string): Promise<Fact[]> {
  await connectDB();
  const match = await Match.findById(matchId).lean();
  if (!match) return [];

  const [prevLb, currLb] = await Promise.all([
    computeLeaderboard({ excludeMatchId: matchId }),
    computeLeaderboard(),
  ]);

  const results = await MatchResult.find({ matchId }).lean();
  const userIds = results.map((r) => String(r.userId));

  // Pull rivalry/withdrawal/prediction data + bonus audit log + mapped
  // Dream11 teams in parallel.
  const [settledRivalries, withdrawnRivalries, preds, bonusAudit, mappedTeams] = await Promise.all([
    Rivalry.find({ matchId, status: "accepted", settled: true }).lean(),
    Rivalry.find({
      matchId,
      status: "cancelled",
      cancelledBy: { $ne: null },
    }).lean(),
    Prediction.find({ matchId, scored: true }).lean(),
    BonusAuditLog.find({ matchId }).lean(),
    UserMatchTeam.find({ matchId }).lean(),
  ]);

  // Collect every userId we need a username for (results + rivalries + bounty).
  const allUserIds = new Set<string>(userIds);
  for (const r of settledRivalries) {
    allUserIds.add(String(r.challengerId));
    allUserIds.add(String(r.opponentId));
    if (r.winnerId) allUserIds.add(String(r.winnerId));
  }
  for (const r of withdrawnRivalries) {
    allUserIds.add(String(r.challengerId));
    allUserIds.add(String(r.opponentId));
    if (r.cancelledBy) allUserIds.add(String(r.cancelledBy));
  }
  if (match.bountyUserId) allUserIds.add(String(match.bountyUserId));
  for (const p of preds) allUserIds.add(String(p.userId));
  for (const c of currLb.slice(0, 10)) allUserIds.add(String(c.userId));
  for (const c of prevLb.slice(0, 5)) allUserIds.add(String(c.userId));
  for (const t of mappedTeams) allUserIds.add(String(t.userId));

  const users = await User.find({ _id: { $in: [...allUserIds] } })
    .select("username userId")
    .lean();
  const nameMap = new Map(users.map((u) => [String(u._id), u.username]));

  const snapshot = await buildAnalyzerSnapshot(userIds, matchId);

  // ---- Bounty context ----
  let bounty: { targetUsername: string | null; beaters: number } | null = null;
  if (match.bountyUserId) {
    const bountyId = String(match.bountyUserId);
    const bountyRes = results.find((r) => String(r.userId) === bountyId);
    const ranked = results
      .filter((r) => !r.missed && r.rank > 0)
      .sort((a, b) => a.rank - b.rank);
    const beaters = bountyRes
      ? ranked.filter((r) => r.rank < bountyRes.rank).length
      : 0;
    bounty = {
      targetUsername: nameMap.get(bountyId) ?? null,
      beaters,
    };
  }

  // ---- Next same-day match (so the model can tee up rivalry targets) ----
  const matchStart = new Date(match.startTime);
  const dayEnd = new Date(matchStart);
  dayEnd.setHours(23, 59, 59, 999);
  const nextSameDay = await Match.findOne({
    _id: { $ne: match._id },
    startTime: { $gt: matchStart, $lte: dayEnd },
    resultsEntered: { $ne: true },
  })
    .sort({ startTime: 1 })
    .select("teamA teamB")
    .lean();
  const nextSameDayMatch = nextSameDay
    ? {
        teamA: nextSameDay.teamA,
        teamB: nextSameDay.teamB,
        topThree: currLb.slice(0, 3).map((r) => ({
          username: nameMap.get(String(r.userId)) ?? r.username,
          totalPoints: r.totalPoints,
        })),
      }
    : null;

  // ---- Predictions summary ----
  const perfectRounds = preds
    .filter((p) => p.allThreeBonus)
    .map((p) => ({
      username: nameMap.get(String(p.userId)) ?? "Unknown",
      pointsAwarded: p.pointsAwarded,
    }));
  const correctWinners = preds.filter((p) => p.correctWinner).length;

  // ---- Rivalry summaries ----
  const settled = settledRivalries
    .map((riv) => {
      const challenger = nameMap.get(String(riv.challengerId));
      const opponent = nameMap.get(String(riv.opponentId));
      if (!challenger || !opponent) return null;
      const winner = riv.winnerId
        ? nameMap.get(String(riv.winnerId)) ?? null
        : null;
      return {
        challenger,
        opponent,
        winner,
        pointsAwarded: riv.pointsAwarded,
        isRevenge: riv.pointsAwarded > 3,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const withdrawn = withdrawnRivalries
    .map((riv) => {
      const byId = String(riv.cancelledBy);
      const withdrawer = nameMap.get(byId);
      const otherId =
        String(riv.challengerId) === byId
          ? String(riv.opponentId)
          : String(riv.challengerId);
      const opponent = nameMap.get(otherId);
      if (!withdrawer || !opponent) return null;
      return { withdrawer, opponent };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  // ---- Per-user mapped Dream11 team breakdowns ----
  // Each row exposes the user's captain pick (real fantasy points at 1x),
  // VC pick, top scorer in their picked 11, biggest flop, and what they
  // would have gained had they captained their own top scorer instead.
  const teams = mappedTeams
    .map((t) => {
      const username = nameMap.get(String(t.userId));
      if (!username) return null;
      const players = (t.players ?? []).filter((p) => p && typeof p.points === "number");
      if (players.length === 0) return null;
      const findCap = players.find((p) => p.isCaptain) ?? null;
      const findVc = players.find((p) => p.isViceCaptain) ?? null;
      const sorted = [...players].sort((a, b) => b.points - a.points);
      const top = sorted[0] ?? null;
      const flop = sorted[sorted.length - 1] ?? null;
      const captainPoints = findCap ? findCap.points : null;
      const captainGainIfBest =
        top && captainPoints != null ? top.points - captainPoints : null;
      return {
        username,
        captain: findCap?.dName || findCap?.name || t.captainName || null,
        captainPoints,
        viceCaptain: findVc?.dName || findVc?.name || t.viceCaptainName || null,
        viceCaptainPoints: findVc ? findVc.points : null,
        topPick: top ? { name: top.dName || top.name, points: top.points } : null,
        flopPick: flop ? { name: flop.dName || flop.name, points: flop.points } : null,
        bestPossibleCaptain: top
          ? { name: top.dName || top.name, points: top.points }
          : null,
        captainGainIfBest,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  // ---- Build the payload and call the AI narrator ----
  const facts: Fact[] = [];
  try {
    const aiInput = buildAiInput({
      match: {
        teamA: match.teamA,
        teamB: match.teamB,
        winner: match.matchWinner,
        bountyUserName: bounty?.targetUsername ?? undefined,
      },
      results: results.map((r) => ({
        userId: String(r.userId),
        rank: r.rank,
        fantasyPoints: r.fantasyPoints,
        finalPoints: r.finalPoints,
        bonusPoints: r.bonusPoints,
        rivalryPoints: r.rivalryPoints,
        civilWarPoints: r.civilWarPoints,
        penaltyPoints: r.penaltyPoints,
        missed: r.missed,
        bonusReasons: (r.bonuses ?? [])
          .filter((b) => b.points > 0 && b.type !== "cap_applied")
          .map((b) => b.type.replace(/_/g, " ")),
      })),
      snapshot,
      prevLb,
      currLb,
      nameMap,
      predictions: {
        total: preds.length,
        correctWinners,
        perfectRounds,
      },
      rivalries: { settled, withdrawn },
      bounty,
      nextSameDayMatch,
      bonusAuditEntries: bonusAudit
        .map((b) => ({
          username: nameMap.get(String(b.userId)) ?? null,
          bonusType: b.bonusType,
          points: b.points,
          explanation: b.explanation,
        }))
        .filter(
          (b): b is { username: string; bonusType: string; points: number; explanation: string } =>
            !!b.username
        ),
      teams,
    });
    const aiFacts = await generateAiFacts(aiInput);
    const idByName = new Map<string, string>();
    for (const [id, name] of nameMap.entries()) idByName.set(name, id);
    for (const f of aiFacts) {
      facts.push({
        text: f.text,
        type: f.type,
        score: f.score,
        userId: f.username ? idByName.get(f.username) : undefined,
      });
    }
  } catch (err) {
    console.warn("[facts] AI narrator failed", err);
  }

  // Persist (append-only — never delete prior facts). Each generation gets
  // its own batchNumber within the match; the dashboard only shows the latest.
  if (facts.length) {
    const prev = await DailyFact.findOne({ matchId })
      .sort({ batchNumber: -1 })
      .select("batchNumber")
      .lean();
    const nextBatch = (prev?.batchNumber ?? 0) + 1;
    await DailyFact.insertMany(
      facts.map((f) => ({
        matchId,
        text: f.text,
        type: f.type,
        score: f.score,
        userId: f.userId,
        batchNumber: nextBatch,
      }))
    );
  }

  // Refresh the dashboard so members see the new storylines on next visit.
  // (We're typically running inside an after() callback, so this fires after
  // the original response was sent.)
  try {
    revalidatePath("/dashboard");
    revalidatePath("/admin");
  } catch {
    // revalidation is best-effort
  }
  return facts;
}

/** Facts from the latest generation batch of the most recently scored match,
 * highest-interest first. Older batches stay in the DB for history. */
export async function getLatestFacts(limit?: number) {
  await connectDB();
  const latest = await DailyFact.findOne().sort({ createdAt: -1 }).lean();
  if (!latest) return [];
  const newest = await DailyFact.findOne({ matchId: latest.matchId })
    .sort({ batchNumber: -1 })
    .select("batchNumber")
    .lean();
  const batchNumber = newest?.batchNumber ?? latest.batchNumber ?? 1;
  const q = DailyFact.find({
    matchId: latest.matchId,
    batchNumber,
  }).sort({ score: -1, createdAt: -1 });
  if (limit && limit > 0) q.limit(limit);
  return q.lean();
}
