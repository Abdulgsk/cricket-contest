import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { computeLeaderboard } from "@/services/scoring";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { formatDate, ordinal } from "@/lib/utils";

export default async function Dashboard() {
  const me = await requireUser();
  await connectDB();
  const lb = await computeLeaderboard();
  const myIdx = lb.findIndex((r) => String(r.userId) === String(me._id));
  const myRow = myIdx >= 0 ? lb[myIdx] : null;
  const next = await Match.findOne({ status: "upcoming", startTime: { $gte: new Date() } })
    .sort({ startTime: 1 })
    .lean();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Hey, {me.username} 👋</h1>
        <p className="text-muted-foreground text-sm">Your fantasy command centre.</p>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1 glow">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Your rank</div>
          <div className="mt-2 text-5xl font-extrabold bg-gradient-to-br from-white to-pink-300 bg-clip-text text-transparent">
            {myRow ? ordinal(myIdx + 1) : "—"}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {myRow?.totalPoints ?? 0} points · {myRow?.wins ?? 0} wins · {myRow?.top3 ?? 0} top-3
          </div>
        </Card>

        <Card className="md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Next match</div>
              {next ? (
                <>
                  <div className="flex items-center gap-2 text-2xl font-bold mt-1">
                    <TeamLogo name={next.teamA} size={32} />
                    <span>{next.teamA}</span>
                    <span className="text-muted-foreground text-sm">vs</span>
                    <TeamLogo name={next.teamB} size={32} />
                    <span>{next.teamB}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{formatDate(next.startTime)}</div>
                </>
              ) : (
                <div className="text-muted-foreground mt-2">No upcoming match scheduled.</div>
              )}
            </div>
            {next && (
              <Link
                href={`/matches/${String(next._id)}`}
                className="rounded-xl bg-primary text-primary-foreground px-6 py-3 md:px-4 md:py-2 text-sm font-semibold glow"
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
          {lb.slice(0, 5).map((r, i) => (
            <li
              key={String(r.userId)}
              className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-2"
            >
              <span className="flex items-center gap-3">
                <Badge tone={i === 0 ? "warning" : "default"}>{i + 1}</Badge>
                <span className="font-medium">{r.username}</span>
                {String(r.userId) === String(me._id) && <Badge tone="accent">You</Badge>}
              </span>
              <span className="text-sm font-semibold">{r.totalPoints} pts</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
