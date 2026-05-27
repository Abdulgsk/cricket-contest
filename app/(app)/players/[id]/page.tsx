import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Match } from "@/models/Match";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";
import { CustomPoolPrediction } from "@/models/CustomPoolPrediction";
import { User } from "@/models/User";
import { Card } from "@/components/ui/card";
import { ClickableUserAvatar } from "@/components/user-avatar";
import { PlayerCharts, type PlayerChartRow } from "@/components/player-charts";
import { BackButton } from "@/components/back-button";
import { getPointsBreakdown } from "@/services/points-breakdown";
import { PointsBreakdownCard } from "@/components/points-breakdown-card";
import {
  buildMatchBreakdowns,
  groupTotals,
} from "@/services/match-breakdown";
import { MatchPointsBreakdownCard } from "@/components/match-points-breakdown";

function formatLastSeen(d: Date | string | null | undefined): string {
  if (!d) return "Never seen";
  const ts = new Date(d).getTime();
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return "Online now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last seen ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `Last seen ${days}d ago`;
  return `Last seen on ${new Date(ts).toLocaleDateString()}`;
}

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  await connectDB();

  const user = await User.findById(id).lean();
  if (!user) notFound();

  const lifetimeBreakdown = await getPointsBreakdown(id);

  // Collect every matchId this user touched (result, prediction, or pool).
  const [resultMatchIds, predictionMatchIds, poolMatchIds] = await Promise.all([
    MatchResult.find({ userId: id }).distinct("matchId"),
    Prediction.find({ userId: id, scored: true }).distinct("matchId"),
    CustomPoolPrediction.find({ userId: id, scored: true }).distinct("matchId"),
  ]);
  const matchIds = Array.from(
    new Set(
      [...resultMatchIds, ...predictionMatchIds, ...poolMatchIds].map((x) => String(x)),
    ),
  );

  const breakdownMap = await buildMatchBreakdowns(id, matchIds);
  const breakdowns = Array.from(breakdownMap.values()).sort(
    (a, b) =>
      new Date(b.match.startTime).getTime() -
      new Date(a.match.startTime).getTime(),
  );

  // ---- Headline totals (per group, lifetime across these matches) ----------
  const lifetime = {
    rank: 0,
    bonus: 0,
    bounty: 0,
    rivalry: 0,
    civilWar: 0,
    captain: 0,
    prediction: 0,
    customPool: 0,
    penalty: 0,
    grand: 0,
  };
  for (const b of breakdowns) {
    const g = groupTotals(b);
    lifetime.rank += g.rank;
    lifetime.bonus += g.bonus;
    lifetime.bounty += g.bounty;
    lifetime.rivalry += g.rivalry;
    lifetime.civilWar += g.civil_war;
    lifetime.captain += g.captain;
    lifetime.prediction += g.prediction;
    lifetime.customPool += g.custom_pool;
    lifetime.penalty += g.penalty;
    lifetime.grand += b.total;
  }

  // ---- Chart data (oldest → newest, with cumulative total) -------------
  const teamShort = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 4)
      .toUpperCase();
  const chronological = [...breakdowns].reverse();
  const chartData: PlayerChartRow[] = [];
  let cumulative = 0;
  for (const b of chronological) {
    cumulative += b.total;
    const g = groupTotals(b);
    chartData.push({
      label: `${teamShort(b.match.teamA)} v ${teamShort(b.match.teamB)}`,
      date: new Date(b.match.startTime).getTime(),
      rankPoints: g.rank,
      bonus: g.bonus + g.bounty,
      rivalry: g.rivalry,
      civilWar: g.civil_war + g.captain,
      prediction: g.prediction,
      customPool: g.custom_pool,
      penalty: g.penalty,
      rank: b.rank,
      cumulative,
      specials: b.specials.map((s) => s.label),
    });
  }

  const headlineCards: { label: string; value: number; tone?: string }[] = [
    { label: "Total", value: lifetime.grand },
    { label: "My11 rank pts", value: lifetime.rank },
    { label: "Bonus", value: lifetime.bonus, tone: "text-success" },
    { label: "Bounty", value: lifetime.bounty, tone: "text-warning" },
    { label: "Rivalry", value: lifetime.rivalry, tone: "text-accent" },
    {
      label: "\ud83d\udee1\ufe0f Civil War",
      value: lifetime.civilWar + lifetime.captain,
      tone:
        lifetime.civilWar + lifetime.captain >= 0 ? "text-accent" : "text-danger",
    },
    { label: "Predictions", value: lifetime.prediction, tone: "text-accent" },
    { label: "Custom pools", value: lifetime.customPool, tone: "text-accent" },
    { label: "Penalty", value: lifetime.penalty, tone: "text-danger" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-start gap-3">
          <ClickableUserAvatar
            src={user.avatar}
            name={user.username}
            profileId={String(user._id)}
            size={56}
          />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold truncate">{user.username}</h1>
            <p className="text-muted-foreground text-sm truncate">@{user.userId}</p>
            <p
              className="text-[11px] text-muted-foreground mt-0.5"
              suppressHydrationWarning
            >
              {formatLastSeen(user.lastSeenAt)}
            </p>
            {user.bio && (
              <div className="mt-2 rounded-xl border border-border bg-muted/20 px-3 py-2 max-w-2xl">
                <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                  {user.bio}
                </p>
              </div>
            )}
          </div>
        </div>
        <BackButton fallbackHref="/leaderboard" />
      </header>

      {/* Lifetime stat strip — only show non-zero buckets so we don't waste
          screen real-estate on noise. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
        {headlineCards
          .filter((c) => c.value !== 0 || c.label === "Total")
          .map((c) => (
            <Card key={c.label} className="py-2 px-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {c.label}
              </div>
              <div className={`text-xl font-bold ${c.tone ?? ""}`}>
                {c.value > 0 && c.label !== "Total" ? "+" : ""}
                {c.value}
              </div>
            </Card>
          ))}
      </div>

      {chartData.length > 0 ? (
        <Card>
          <h2 className="font-semibold mb-3">
            📊 {user.username}&apos;s stats
          </h2>
          <PlayerCharts data={chartData} />
        </Card>
      ) : (
        <Card>
          <h2 className="font-semibold mb-2">
            📊 {user.username}&apos;s stats
          </h2>
          <p className="text-sm text-muted-foreground">
            Charts will appear here once match results are scored.
          </p>
        </Card>
      )}

      <PointsBreakdownCard
        breakdown={lifetimeBreakdown}
        title={`${user.username}'s points by source`}
        subtitle="Every discrete way they have gained or lost points this season."
      />

      <h2 className="text-xl font-semibold mt-4">Match-by-match breakdown</h2>
      {breakdowns.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">No scored matches yet.</p>
        </Card>
      )}
      <div className="space-y-3">
        {breakdowns.map((b) => (
          <MatchPointsBreakdownCard key={b.matchId} breakdown={b} />
        ))}
      </div>
    </div>
  );
}
