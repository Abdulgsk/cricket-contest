import { requireUser } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";

async function getPlayerStats(userId: string) {
  const [user, results, predictions] = await Promise.all([
    User.findById(userId).lean(),
    MatchResult.find({ userId }).lean(),
    Prediction.find({ userId, scored: true }).lean(),
  ]);

  if (!user) {
    throw new Error("User not found");
  }

  let totalPoints = 0;
  let leaguePoints = 0;
  let predictionPoints = 0;
  let bonusPoints = 0;
  let bountyPoints = 0;
  let rivalryPoints = 0;
  let penaltyPoints = 0;
  let matches = 0;
  let wins = 0;
  let silver = 0;
  let bronze = 0;
  let maxPoints = -Infinity;
  let minPoints = Infinity;
  const ranks: number[] = [];
  const recentResults: { matchPoints: number; rank: number; date: Date }[] = [];

  for (const r of results) {
    if (!r.missed) {
      matches++;
    }
    const finalPts = r.finalPoints || 0;
    const basePts = r.basePoints || 0;

    leaguePoints += basePts;
    bonusPoints += r.bonusPoints || 0;
    bountyPoints += r.bountyPoints || 0;
    rivalryPoints += r.rivalryPoints || 0;
    penaltyPoints += r.penaltyPoints || 0;
    totalPoints += finalPts;

    maxPoints = Math.max(maxPoints, finalPts);
    minPoints = Math.min(minPoints, finalPts);

    if (r.rank === 1) wins++;
    if (r.rank === 2) silver++;
    if (r.rank === 3) bronze++;
    if (r.rank > 0) ranks.push(r.rank);

    // Store recent results for trend analysis
    recentResults.push({
      matchPoints: finalPts,
      rank: r.rank,
      date: r.createdAt || new Date(),
    });
  }

  for (const p of predictions) {
    predictionPoints += p.pointsAwarded || 0;
  }

  // Add prediction points to the season total (not included in MatchResult.finalPoints)
  totalPoints += predictionPoints;

  const top3 = wins + silver + bronze;
  const top5 = ranks.filter((r) => r <= 5).length;
  const averageFinish =
    ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
  const averagePointsPerMatch =
    matches > 0 ? (totalPoints - predictionPoints) / matches : 0;
  const winRate = matches > 0 ? ((wins / matches) * 100).toFixed(1) : "0";
  const podiumRate = matches > 0 ? ((top3 / matches) * 100).toFixed(1) : "0";

  // Recent form (last 5 matches)
  const recentFormData = recentResults
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5)
    .map((r) => r.matchPoints)
    .reverse();

  const consistency =
    recentFormData.length > 0
      ? recentFormData.reduce((a, b) => a + b, 0) / recentFormData.length
      : 0;

  return {
    userId: String(user._id),
    username: user.username,
    avatar: user.avatar,
    totalPoints,
    leaguePoints,
    predictionPoints,
    bonusPoints,
    bountyPoints,
    rivalryPoints,
    penaltyPoints,
    matches,
    wins,
    silver,
    bronze,
    top3,
    top5,
    averageFinish,
    averagePointsPerMatch: parseFloat(averagePointsPerMatch.toFixed(2)),
    winRate: parseFloat(winRate),
    podiumRate: parseFloat(podiumRate),
    maxPoints: maxPoints === -Infinity ? 0 : maxPoints,
    minPoints: minPoints === Infinity ? 0 : minPoints,
    recentForm: recentFormData,
    consistency: parseFloat(consistency.toFixed(2)),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser();
    const { id: opponentId } = await params;

    if (String(me._id) === opponentId) {
      return Response.json(
        { error: "Cannot compare with yourself" },
        { status: 400 }
      );
    }

    await connectDB();

    const [myStats, opponentStats] = await Promise.all([
      getPlayerStats(String(me._id)),
      getPlayerStats(opponentId),
    ]);

    return Response.json(
      {
        me: myStats,
        opponent: opponentStats,
      },
      {
        // Heavy aggregation; only changes when a match result is submitted.
        // Private to the requesting user (`myStats` is their data).
        headers: {
          "Cache-Control":
            "private, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (e: any) {
    console.error(e);
    return Response.json(
      { error: e.message || "Comparison failed" },
      { status: 500 }
    );
  }
}
