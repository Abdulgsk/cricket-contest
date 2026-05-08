import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";
import { requireUser } from "@/lib/rbac";
import { getPredictionSuspense } from "@/services/prediction-engine";
import { getCustomPoolsForMatch } from "@/actions/custom-pools";
import { Card, Badge } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { formatDate } from "@/lib/utils";
import { PredictionForm } from "@/components/prediction-form";
import { CustomPoolsList } from "@/components/custom-pools-list";
import { MatchPlayers } from "@/components/match/match-players";
import { FetchPlayersButton } from "@/components/match/fetch-players-button";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  await connectDB();
  const match = await Match.findById(id).lean();
  if (!match) notFound();

  const myPred = await Prediction.findOne({ matchId: id, userId: me._id }).lean();
  const suspense = await getPredictionSuspense(id);
  const pools = await getCustomPoolsForMatch(id, String(me._id));
  const results = match.status === "completed"
    ? await MatchResult.find({ matchId: id }).populate("userId", "username userId").sort({ rank: 1 }).lean()
    : [];

  const matchStarted = new Date(match.startTime) <= new Date();
  const isAdmin = me.role === "admin" || me.role === "superadmin";

  return (
    <div className="space-y-6">
      <Card className="glow">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-3xl font-bold">
              <TeamLogo name={match.teamA} size={40} />
              <span>{match.teamA}</span>
              <span className="text-muted-foreground text-base">vs</span>
              <TeamLogo name={match.teamB} size={40} />
              <span>{match.teamB}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">{formatDate(match.startTime)}</div>
            {match.venue && <div className="text-xs text-muted-foreground">📍 {match.venue}</div>}
            {match.scoreSummary && (
              <div className="text-xs text-foreground mt-1 font-mono">{match.scoreSummary}</div>
            )}
            {match.matchWinner && (
              <div className="text-sm text-success mt-1">🏆 {match.matchWinner} won</div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone={match.status === "live" ? "danger" : match.status === "completed" ? "success" : "accent"}>
              {match.status}
            </Badge>
            {match.stage && match.stage !== "League" && <Badge tone="warning">{match.stage}</Badge>}
            {isAdmin && <FetchPlayersButton matchId={id} />}
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {match.doublePoints && <Badge tone="warning">2× Points</Badge>}
          {match.chaosMatch && <Badge tone="danger">Chaos</Badge>}
          {match.noBonus && <Badge tone="default">No Bonus</Badge>}
          {match.predictionMadness && <Badge tone="accent">Prediction Madness</Badge>}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-semibold mb-3">Your Prediction</h2>
          {myPred ? (
            <div className="space-y-2 text-sm">
              <p className="text-success text-xs">🔒 LOCKED — cannot be edited.</p>
              <Field label="Winner" value={myPred.winner} />
              <Field label="Top batter" value={myPred.topBatter} />
              <Field label="Top bowler" value={myPred.topBowler} />
              {myPred.scored && (
                <div className="mt-3 rounded-xl bg-success/10 p-3 text-success">
                  Earned {myPred.pointsAwarded} prediction points
                </div>
              )}
            </div>
          ) : matchStarted ? (
            <p className="text-sm text-muted-foreground">You did not submit a prediction in time.</p>
          ) : (
            <PredictionForm
              matchId={id}
              teamA={match.teamA}
              teamB={match.teamB}
              players={(match.players ?? []).map((p) => p.name)}
            />
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-3">Suspense Pool</h2>
          <p className="text-xs text-muted-foreground mb-3">
            {suspense.totalCount} prediction{suspense.totalCount === 1 ? "" : "s"} submitted ·{" "}
            {suspense.revealed ? "🔓 revealed" : "🔒 hidden until match starts"}
          </p>
          <div className="space-y-2">
            {suspense.winnerSplit.map((w) => (
              <div key={w.choice} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{w.choice}</span>
                  <span className="text-muted-foreground">{w.pct}% ({w.count})</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-pink-500 to-sky-400" style={{ width: `${w.pct}%` }} />
                </div>
              </div>
            ))}
            {!suspense.winnerSplit.length && (
              <p className="text-xs text-muted-foreground">No predictions yet.</p>
            )}
          </div>

          {suspense.revealed && suspense.predictions && (
            <div className="mt-4">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">All predictions</h3>
              <div className="space-y-1.5">
                {suspense.predictions.map((p) => {
                  const u = p.userId as unknown as { username: string; userId: string };
                  return (
                    <div key={String(p._id)} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                      <span className="font-medium">{u.username}</span>
                      <span className="text-muted-foreground">
                        {p.winner} · {p.topBatter} · {p.topBowler}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      <CustomPoolsList pools={pools} matchStarted={matchStarted} />

      <MatchPlayers
        players={match.players}
        teamA={match.teamA}
        teamB={match.teamB}
        teamAShort={match.teamAShort}
        teamBShort={match.teamBShort}
      />

      {results.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-3">Match Results</h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground text-left">
              <tr>
                <th className="p-2">Rank</th>
                <th className="p-2">Player</th>
                <th className="p-2 text-right">FP</th>
                <th className="p-2 text-right">Base</th>
                <th className="p-2 text-right">Bonus</th>
                <th className="p-2 text-right">Penalty</th>
                <th className="p-2 text-right">Final</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const u = r.userId as unknown as { username: string; userId: string };
                return (
                  <tr key={String(r._id)} className="border-t border-border/50">
                    <td className="p-2 font-bold">{r.missed ? "—" : r.rank}</td>
                    <td className="p-2">{u.username}</td>
                    <td className="p-2 text-right">{r.fantasyPoints}</td>
                    <td className="p-2 text-right">{r.basePoints}</td>
                    <td className="p-2 text-right text-success">+{r.bonusPoints}</td>
                    <td className="p-2 text-right text-danger">{r.penaltyPoints}</td>
                    <td className="p-2 text-right font-bold text-primary">{r.finalPoints}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Bonus & penalty breakdown</h3>
            {results
              .flatMap((r) => {
                const u = r.userId as unknown as { username: string };
                return [...r.bonuses, ...r.penalties].map((b) => ({ ...b, who: u.username }));
              })
              .map((b, i) => (
                <div key={i} className="flex justify-between text-xs rounded-lg bg-muted/30 px-3 py-2">
                  <span>
                    <span className="font-semibold">{b.who}</span>{" "}
                    <span className="text-muted-foreground">· {b.reason}</span>
                  </span>
                  <span className={b.points >= 0 ? "text-success" : "text-danger"}>
                    {b.points >= 0 ? "+" : ""}
                    {b.points}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-lg bg-muted/30 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
