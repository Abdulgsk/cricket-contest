import { requireUser } from "@/lib/rbac";
import { computeLeaderboard } from "@/services/scoring";
import { Card, Badge } from "@/components/ui/card";
import { ClickableUserAvatar } from "@/components/user-avatar";
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
        <table className="w-full text-[13px] leading-tight">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="text-left whitespace-nowrap">
              <th className="px-2 py-1.5 sm:px-2.5">#</th>
              <th className="px-2 py-1.5 sm:px-2.5">Player</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right">Total</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">League</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">Predictions</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">Bonus</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell" title="Per-match bounty">🎯 Bounty</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden lg:table-cell" title="Rivalry duels">⚔️ Rivalry</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden lg:table-cell" title="Civil War team battles">🛡️ Civil War</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">Penalty</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-center hidden sm:table-cell text-[13px] sm:text-[15px]" title="Gold (1st place finishes)">🥇</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-center hidden sm:table-cell text-[13px] sm:text-[15px]" title="Silver (2nd place finishes)">🥈</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-center hidden sm:table-cell text-[13px] sm:text-[15px]" title="Bronze (3rd place finishes)">🥉</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">Avg</th>
              <th className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">Missed</th>
            </tr>
          </thead>
          <tbody>
            {lb.map((r, i) => {
              const mine = String(r.userId) === String(me._id);
              return (
                <tr
                  key={String(r.userId)}
                  className={
                    "whitespace-nowrap " +
                    (mine ? "bg-primary/10" : i % 2 ? "bg-muted/20" : "")
                  }
                >
                  <td className="px-2 py-1.5 sm:px-2.5 font-bold">
                    {r.position === 1 ? "🏆" : r.position}
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5">
                    <div className="flex items-center gap-2.5">
                      <ClickableUserAvatar
                        src={r.avatar}
                        name={r.username}
                        size={28}
                      />
                      <Link
                        href={`/players/${String(r.userId)}`}
                        className="hover:underline min-w-0"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{r.username}</span>
                          {mine && <Badge tone="accent">You</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">@{r.handle}</div>
                      </Link>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right font-bold text-primary">{r.totalPoints}</td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">{r.leaguePoints}</td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">{r.predictionPoints}</td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell text-success">+{r.bonusPoints}</td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell tabular-nums">
                    {r.bountyPoints !== 0 ? (
                      <span className="text-warning">+{r.bountyPoints}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden lg:table-cell tabular-nums">
                    {r.rivalryPoints !== 0 ? (
                      <span className={r.rivalryPoints > 0 ? "text-accent" : "text-danger"}>
                        {r.rivalryPoints > 0 ? "+" : ""}
                        {r.rivalryPoints}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden lg:table-cell tabular-nums">
                    {r.civilWarPoints !== 0 ? (
                      <span className={r.civilWarPoints > 0 ? "text-accent" : "text-danger"}>
                        {r.civilWarPoints > 0 ? "+" : ""}
                        {r.civilWarPoints}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell text-danger">{r.penaltyPoints}</td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-center hidden sm:table-cell">
                    {r.wins > 0 ? <span className="font-semibold text-yellow-400 text-[13px] sm:text-[15px]">🥇 {r.wins}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-center hidden sm:table-cell">
                    {r.silver > 0 ? <span className="font-semibold text-zinc-300 text-[13px] sm:text-[15px]">🥈 {r.silver}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-center hidden sm:table-cell">
                    {r.bronze > 0 ? <span className="font-semibold text-amber-600 text-[13px] sm:text-[15px]">🥉 {r.bronze}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">
                    {r.averageFinish ? r.averageFinish.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-1.5 sm:px-2.5 text-right hidden md:table-cell">{r.missed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
