import { requireUser } from "@/lib/rbac";
import { Badge, Card } from "@/components/ui/card";
import { ProfileForms } from "@/components/profile-forms";
import { getMyRivalryAndCivilWarRecord } from "@/actions/civil-war";
import { ProfileResultsSelector } from "@/components/profile-results-selector";
import { PlayerCharts, type PlayerChartRow } from "@/components/player-charts";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";

export default async function ProfilePage() {
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
    matchId: string;
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
      matchId: mid,
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

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">{me.username}</h1>
          <p className="text-muted-foreground text-sm truncate">@{me.userId}</p>
        </div>
        <Badge
          tone={
            me.role === "superadmin"
              ? "warning"
              : me.role === "admin"
                ? "accent"
                : "default"
          }
        >
          {me.role}
        </Badge>
      </header>

      <ProfileForms
        initial={{
          username: me.username,
          whatsapp: me.whatsapp,
          my11circleName: me.my11circleName,
          avatar: me.avatar ?? null,
          bio: me.bio ?? null,
        }}
      />

      {chartData.length > 0 && (
        <Card>
          <PlayerCharts data={chartData} />
        </Card>
      )}

      <ProfileResultsSelector
        rivalries={record.recentRivalries}
        civilWars={record.recentCivilWars}
      />
    </div>
  );
}
