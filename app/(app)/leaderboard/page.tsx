import { requireUser } from "@/lib/rbac";
import { computeLeaderboard } from "@/services/scoring";
import { Card, Badge } from "@/components/ui/card";
import Link from "next/link";

export default async function LeaderboardPage() {
  const me = await requireUser();
  const lb = await computeLeaderboard();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">League Leaderboard</h1>
        <p className="text-muted-foreground text-sm">Updated live after every match.</p>
      </header>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr className="text-left">
              <th className="p-2 sm:p-3">#</th>
              <th className="p-2 sm:p-3">Player</th>
              <th className="p-2 sm:p-3 text-right">Total</th>
              <th className="p-2 sm:p-3 text-right hidden md:table-cell">League</th>
              <th className="p-2 sm:p-3 text-right hidden md:table-cell">Predictions</th>
              <th className="p-2 sm:p-3 text-right hidden md:table-cell">Bonus</th>
              <th className="p-2 sm:p-3 text-right hidden md:table-cell">Penalty</th>
              <th className="p-2 sm:p-3 text-right hidden sm:table-cell">W</th>
              <th className="p-2 sm:p-3 text-right hidden sm:table-cell">T3</th>
              <th className="p-2 sm:p-3 text-right hidden md:table-cell">Avg</th>
              <th className="p-2 sm:p-3 text-right hidden md:table-cell">Missed</th>
            </tr>
          </thead>
          <tbody>
            {lb.map((r, i) => {
              const mine = String(r.userId) === String(me._id);
              return (
                <tr
                  key={String(r.userId)}
                  className={mine ? "bg-primary/10" : i % 2 ? "bg-muted/20" : ""}
                >
                  <td className="p-2 sm:p-3 font-bold">
                    {i === 0 ? "🏆" : i + 1}
                  </td>
                  <td className="p-2 sm:p-3">
                    <Link
                      href={`/players/${String(r.userId)}`}
                      className="hover:underline"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{r.username}</span>
                        {mine && <Badge tone="accent">You</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">@{r.handle}</div>
                    </Link>
                  </td>
                  <td className="p-2 sm:p-3 text-right font-bold text-primary">{r.totalPoints}</td>
                  <td className="p-2 sm:p-3 text-right hidden md:table-cell">{r.leaguePoints}</td>
                  <td className="p-2 sm:p-3 text-right hidden md:table-cell">{r.predictionPoints}</td>
                  <td className="p-2 sm:p-3 text-right hidden md:table-cell text-success">+{r.bonusPoints}</td>
                  <td className="p-2 sm:p-3 text-right hidden md:table-cell text-danger">{r.penaltyPoints}</td>
                  <td className="p-2 sm:p-3 text-right hidden sm:table-cell">{r.wins}</td>
                  <td className="p-2 sm:p-3 text-right hidden sm:table-cell">{r.top3}</td>
                  <td className="p-2 sm:p-3 text-right hidden md:table-cell">
                    {r.averageFinish ? r.averageFinish.toFixed(1) : "—"}
                  </td>
                  <td className="p-2 sm:p-3 text-right hidden md:table-cell">{r.missed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
