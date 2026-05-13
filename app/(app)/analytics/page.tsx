import { requireUser } from "@/lib/rbac";
import { computeLeaderboard } from "@/services/scoring";
import { Card } from "@/components/ui/card";
import { AnalyticsCharts } from "@/components/analytics-charts";
import { getMyRivalryAndCivilWarRecord } from "@/actions/civil-war";
import { ProfileResultsSelector } from "@/components/profile-results-selector";
import { PlayerCharts, type PlayerChartRow } from "@/components/player-charts";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";

export default async function AnalyticsPage() {
  const me = await requireUser();
  const record = await getMyRivalryAndCivilWarRecord();

  await connectDB();
  const [results, predictions] = await Promise.all([
    MatchResult.find({ userId: me._id })
      .populate({ path: "matchId", model: Match })
      .lean(),
    Prediction.find({ userId: me._id, scored: true }).lean(),
  ]);

  const predByMatch = new Map<string, number>();
  for (const p of predictions) {
    if (p.matchId) {
      predByMatch.set(String(p.matchId), p.pointsAwarded ?? 0);
    }
  }

  type Row = {
    startTime: number;
    teamA: string;
    teamB: string;
    league: number;
    prediction: number;
    bonus: number;
    penalty: number;
    rank: number;
  };

  const rows: Row[] = [];
  for (const r of results) {
    const m = r.matchId as unknown as {
      _id: unknown;
      teamA: string;
      teamB: string;
      startTime: Date;
    } | null;
    if (!m) continue;
    const mid = String(m._id);
    rows.push({
      startTime: new Date(m.startTime).getTime(),
      teamA: m.teamA,
      teamB: m.teamB,
      league: r.finalPoints,
      prediction: predByMatch.get(mid) ?? 0,
      bonus: r.bonusPoints,
      penalty: r.penaltyPoints,
      rank: r.rank,
    });
  }
  rows.sort((a, b) => a.startTime - b.startTime);

  const teamShort = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 4)
      .toUpperCase();

  let cumulative = 0;
  const chartData: PlayerChartRow[] = rows.map((r) => {
    cumulative += r.league;
    return {
      label: `${teamShort(r.teamA)} v ${teamShort(r.teamB)}`,
      date: r.startTime,
      league: r.league,
      prediction: r.prediction,
      bonus: r.bonus,
      penalty: r.penalty,
      rank: r.rank,
      cumulative,
    };
  });

  const lb = await computeLeaderboard();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm">Your charts first, then league-wide insights.</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">My Analytics</h2>
        {chartData.length > 0 ? (
          <Card>
            <PlayerCharts data={chartData} />
          </Card>
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Your charts will appear here once match results are scored.
            </p>
          </Card>
        )}
        <ProfileResultsSelector
          rivalries={record.recentRivalries}
          civilWars={record.recentCivilWars}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">League Analytics</h2>
      <Card>
        <AnalyticsCharts data={lb.map((r) => ({
          name: r.username,
          total: r.totalPoints,
          bonus: r.bonusPoints,
          penalty: -r.penaltyPoints,
          predictions: r.predictionPoints,
        }))} />
      </Card>
      </section>
    </div>
  );
}
