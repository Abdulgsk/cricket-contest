import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { computeLeaderboard } from "@/services/scoring";
import { getLatestFacts } from "@/services/facts";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { formatDate, ordinal } from "@/lib/utils";
import { autoUpdateMatchStatuses } from "@/services/match-status";
import { NotificationBell } from "@/components/notification-bell";

export default async function Dashboard() {
  const me = await requireUser();
  await connectDB();
  
  // Auto-update match statuses on page load
  await autoUpdateMatchStatuses();
  
  const lb = await computeLeaderboard();
  const myRow = lb.find((r) => String(r.userId) === String(me._id)) ?? null;
  const next = await Match.findOne({ status: "upcoming", startTime: { $gte: new Date() } })
    .sort({ startTime: 1 })
    .lean();
  const facts = await getLatestFacts();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">Hey, {me.username} 👋</h1>
          <p className="text-muted-foreground text-sm">Your fantasy command centre.</p>
        </div>
        <div className="shrink-0">
          <NotificationBell />
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1 glow">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Your rank</div>
          <div className="mt-2 text-5xl font-extrabold bg-gradient-to-br from-foreground to-primary bg-clip-text text-transparent">
            {myRow ? ordinal(myRow.position) : "—"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {myRow?.totalPoints ?? 0} points · <span className="text-base">🥇</span> {myRow?.wins ?? 0} · <span className="text-base">🥈</span> {myRow?.silver ?? 0} · <span className="text-base">🥉</span> {myRow?.bronze ?? 0}
          </div>
        </Card>

        <Card className="md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Next match</div>
              {next ? (
                <>
                  <div className="flex items-center flex-wrap gap-2 text-lg sm:text-2xl font-bold mt-1">
                    <TeamLogo name={next.teamA} size={28} />
                    <span className="truncate">{next.teamA}</span>
                    <span className="text-muted-foreground text-sm">vs</span>
                    <TeamLogo name={next.teamB} size={28} />
                    <span className="truncate">{next.teamB}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{formatDate(next.startTime)}</div>
                </>
              ) : (
                <div className="text-muted-foreground mt-2">No upcoming match scheduled.</div>
              )}
            </div>
            {next && (
              <Link
                href={`/matches/${String(next._id)}`}
                className="shrink-0 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold glow text-center w-full sm:w-auto"
              >
                Predict →
              </Link>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Top of the table</h2>
          <Link href="/leaderboard" className="text-xs text-muted-foreground hover:text-foreground">View full →</Link>
        </div>
        <ol className="space-y-2">
          {lb.slice(0, 5).map((r) => (
            <li
              key={String(r.userId)}
              className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 sm:px-4 py-2"
            >
              <span className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Badge tone={r.position === 1 ? "warning" : "default"}>{r.position}</Badge>
                <span className="font-medium truncate">{r.username}</span>
                {String(r.userId) === String(me._id) && <Badge tone="accent">You</Badge>}
              </span>
              <span className="text-sm font-semibold shrink-0">{r.totalPoints} pts</span>
            </li>
          ))}
        </ol>
      </Card>

      {facts.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">📰 Today&apos;s storylines</h2>
            <span className="text-xs text-muted-foreground">From the latest match</span>
          </div>
          <ul className="space-y-2">
            {facts.map((f) => (
              <li
                key={String(f._id)}
                className="rounded-xl bg-muted/40 px-3 sm:px-4 py-2 text-sm leading-relaxed"
              >
                {f.text}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
