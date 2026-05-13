import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Match } from "@/models/Match";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";
import { User } from "@/models/User";
import { Card, Badge } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { ClickableUserAvatar } from "@/components/user-avatar";
import { PlayerCharts, type PlayerChartRow } from "@/components/player-charts";
import { formatDate } from "@/lib/utils";
import { PREDICTION_POINTS } from "@/lib/constants";

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

  const [results, predictions] = await Promise.all([
    MatchResult.find({ userId: id })
      .populate({ path: "matchId", model: Match })
      .lean(),
    Prediction.find({ userId: id, scored: true })
      .populate({ path: "matchId", model: Match })
      .lean(),
  ]);

  // Index predictions by match
  const predByMatch = new Map<string, (typeof predictions)[number]>();
  for (const p of predictions) {
    if (p.matchId) predByMatch.set(String((p.matchId as { _id: unknown })._id), p);
  }

  // Combine into per-match rows
  type Row = {
    matchId: string;
    match: { teamA: string; teamB: string; startTime: Date; matchWinner?: string } | null;
    leaguePoints: number;
    base: number;
    bonus: number;
    bounty: number;
    rivalry: number;
    penalty: number;
    bonuses: { type: string; points: number; reason: string }[];
    penalties: { type: string; points: number; reason: string }[];
    rank: number;
    fp: number;
    missed: boolean;
    predPoints: number;
    predBreak: { label: string; points: number; correct: boolean }[];
  };

  const rows: Row[] = [];
  for (const r of results) {
    const m = r.matchId as unknown as {
      _id: unknown;
      teamA: string;
      teamB: string;
      startTime: Date;
      matchWinner?: string;
    } | null;
    const mid = m ? String(m._id) : String(r.matchId);
    const pred = predByMatch.get(mid);
    const predBreak: Row["predBreak"] = [];
    if (pred) {
      predBreak.push({
        label: `Winner: ${pred.winner}`,
        points: pred.correctWinner ? PREDICTION_POINTS.WINNER : 0,
        correct: !!pred.correctWinner,
      });
      predBreak.push({
        label: `Top batter: ${pred.topBatter}`,
        points: pred.correctBatter ? PREDICTION_POINTS.TOP_BATTER : 0,
        correct: !!pred.correctBatter,
      });
      predBreak.push({
        label: `Top bowler: ${pred.topBowler}`,
        points: pred.correctBowler ? PREDICTION_POINTS.TOP_BOWLER : 0,
        correct: !!pred.correctBowler,
      });
      if (pred.allThreeBonus) {
        predBreak.push({
          label: "All 3 correct bonus",
          points: PREDICTION_POINTS.ALL_THREE_BONUS,
          correct: true,
        });
      }
    }
    rows.push({
      matchId: mid,
      match: m
        ? {
            teamA: m.teamA,
            teamB: m.teamB,
            startTime: m.startTime,
            matchWinner: m.matchWinner,
          }
        : null,
      leaguePoints: r.finalPoints,
      base: r.basePoints,
      bonus: r.bonusPoints,
      bounty: r.bountyPoints ?? 0,
      rivalry: r.rivalryPoints ?? 0,
      penalty: r.penaltyPoints,
      bonuses: r.bonuses ?? [],
      penalties: r.penalties ?? [],
      rank: r.rank,
      fp: r.fantasyPoints,
      missed: r.missed,
      predPoints: pred?.pointsAwarded ?? 0,
      predBreak,
    });
  }

  // Predictions for matches with no MatchResult yet (shouldn't happen but safe)
  for (const [mid, pred] of predByMatch) {
    if (rows.find((r) => r.matchId === mid)) continue;
    const m = pred.matchId as unknown as {
      teamA: string;
      teamB: string;
      startTime: Date;
      matchWinner?: string;
    };
    rows.push({
      matchId: mid,
      match: m,
      leaguePoints: 0,
      base: 0,
      bonus: 0,
      bounty: 0,
      rivalry: 0,
      penalty: 0,
      bonuses: [],
      penalties: [],
      rank: 0,
      fp: 0,
      missed: false,
      predPoints: pred.pointsAwarded,
      predBreak: [],
    });
  }

  rows.sort((a, b) => {
    const ad = a.match?.startTime ? new Date(a.match.startTime).getTime() : 0;
    const bd = b.match?.startTime ? new Date(b.match.startTime).getTime() : 0;
    return bd - ad;
  });

  // Totals
  const totals = rows.reduce(
    (acc, r) => {
      acc.league += r.leaguePoints;
      acc.bonus += r.bonus;
      acc.bounty += r.bounty;
      acc.rivalry += r.rivalry;
      acc.penalty += r.penalty;
      acc.pred += r.predPoints;
      return acc;
    },
    { league: 0, bonus: 0, bounty: 0, rivalry: 0, penalty: 0, pred: 0 }
  );

  // Chart data — oldest → newest with running cumulative league points
  const chronological = [...rows].reverse();
  const teamShort = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 4)
      .toUpperCase();
  const chartData: PlayerChartRow[] = [];
  let cumulative = 0;
  for (const r of chronological) {
    cumulative += r.leaguePoints;
    const label = r.match
      ? `${teamShort(r.match.teamA)} v ${teamShort(r.match.teamB)}`
      : "—";
    chartData.push({
      label,
      date: r.match?.startTime ? new Date(r.match.startTime).getTime() : 0,
      league: r.leaguePoints,
      prediction: r.predPoints,
      bonus: r.bonus,
      penalty: r.penalty,
      rank: r.rank,
      cumulative,
    });
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-start gap-3">
          <ClickableUserAvatar src={user.avatar} name={user.username} size={56} />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold truncate">{user.username}</h1>
            <p className="text-muted-foreground text-sm truncate">@{user.userId}</p>
            {user.bio && (
              <p className="text-sm text-foreground/90 mt-1 whitespace-pre-wrap break-words max-w-prose">
                {user.bio}
              </p>
            )}
          </div>
        </div>
        <Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground shrink-0">
          ← Leaderboard
        </Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card>
          <div className="text-xs text-muted-foreground">League</div>
          <div className="text-2xl font-bold">{totals.league}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">Predictions</div>
          <div className="text-2xl font-bold">{totals.pred}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">Bonus (lifetime)</div>
          <div className="text-2xl font-bold text-success">+{totals.bonus}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">Bounty (lifetime)</div>
          <div className="text-2xl font-bold text-warning">+{totals.bounty}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">Rivalry (lifetime)</div>
          <div className="text-2xl font-bold text-accent">+{totals.rivalry}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted-foreground">Penalty (lifetime)</div>
          <div className="text-2xl font-bold text-danger">{totals.penalty}</div>
        </Card>
      </div>

      {chartData.length > 0 ? (
        <Card>
          <h2 className="font-semibold mb-3">📊 {user.username}&apos;s stats</h2>
          <PlayerCharts data={chartData} />
        </Card>
      ) : (
        <Card>
          <h2 className="font-semibold mb-2">📊 {user.username}&apos;s stats</h2>
          <p className="text-sm text-muted-foreground">
            Charts will appear here once match results are scored.
          </p>
        </Card>
      )}

      <h2 className="text-xl font-semibold mt-4">Match-by-match breakdown</h2>
      {rows.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">No scored matches yet.</p>
        </Card>
      )}
      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.matchId} className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Link
                href={`/matches/${r.matchId}`}
                className="flex items-center gap-2 font-semibold hover:underline"
              >
                {r.match && (
                  <>
                    <TeamLogo name={r.match.teamA} size={22} />
                    <span>{r.match.teamA}</span>
                    <span className="text-muted-foreground text-xs">vs</span>
                    <TeamLogo name={r.match.teamB} size={22} />
                    <span>{r.match.teamB}</span>
                  </>
                )}
              </Link>
              <div className="text-xs text-muted-foreground">
                {r.match?.startTime ? formatDate(r.match.startTime) : ""}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {r.missed ? (
                <Badge tone="danger">Missed match</Badge>
              ) : r.rank > 0 ? (
                <Badge tone="accent">Rank #{r.rank}</Badge>
              ) : null}
              {r.fp > 0 && (
                <Badge tone="default">{r.fp} Dream11 pts</Badge>
              )}
              <Badge tone="success">League: {r.leaguePoints}</Badge>
              {!r.missed && r.rank > 0 && (
                <Badge tone="default">My11 rank pts: +{r.base}</Badge>
              )}
              {r.bounty > 0 && <Badge tone="warning">Bounty: +{r.bounty}</Badge>}
              {r.rivalry > 0 && <Badge tone="accent">Rivalry: +{r.rivalry}</Badge>}
              {r.predPoints > 0 && (
                <Badge tone="accent">Prediction: +{r.predPoints}</Badge>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-muted/30 p-2">
                <div className="font-medium mb-1">League points</div>
                <div className="space-y-0.5">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Base (rank)</span>
                    <span className="shrink-0">{r.base}</span>
                  </div>
                  {r.bonuses.filter((b) => b.points !== 0).map((b, i) => (
                    <div key={`b${i}`} className="flex justify-between gap-3 text-success">
                      <span className="break-words">+ {b.reason}</span>
                      <span className="shrink-0">+{b.points}</span>
                    </div>
                  ))}
                  {r.bounty > 0 && (
                    <div className="flex justify-between gap-3 text-warning">
                      <span>+ Match bounty</span>
                      <span className="shrink-0">+{r.bounty}</span>
                    </div>
                  )}
                  {r.rivalry > 0 && (
                    <div className="flex justify-between gap-3 text-accent">
                      <span>+ Rivalry win</span>
                      <span className="shrink-0">+{r.rivalry}</span>
                    </div>
                  )}
                  {r.penalties.map((p, i) => (
                    <div key={`p${i}`} className="flex justify-between gap-3 text-danger">
                      <span className="break-words">− {p.reason}</span>
                      <span className="shrink-0">{p.points}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-semibold pt-1 border-t border-border">
                    <span>Total</span>
                    <span>{r.leaguePoints}</span>
                  </div>
                </div>
              </div>
              {r.predBreak.length > 0 && (
                <div className="rounded-lg bg-muted/30 p-2">
                  <div className="font-medium mb-1">Predictions</div>
                  <div className="space-y-0.5">
                    {r.predBreak.map((pb, i) => (
                      <div
                        key={i}
                        className={`flex justify-between ${
                          pb.correct ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        <span>
                          {pb.correct ? "✓" : "✗"} {pb.label}
                        </span>
                        <span>{pb.points > 0 ? `+${pb.points}` : "0"}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-semibold pt-1 border-t border-border">
                      <span>Total</span>
                      <span>{r.predPoints}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
