import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { requireUser } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { formatDate } from "@/lib/utils";
import type { IMatch } from "@/models/Match";

type MatchLean = Omit<IMatch, "_id"> & { _id: { toString(): string } };

function MatchCard({ m, completed }: { m: MatchLean; completed?: boolean }) {
  return (
    <Link href={`/matches/${String(m._id)}`}>
      <Card className="hover:scale-[1.01] transition cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-bold">
            <TeamLogo name={m.teamA} size={28} />
            <span>{m.teamA}</span>
            <span className="text-muted-foreground text-sm">vs</span>
            <TeamLogo name={m.teamB} size={28} />
            <span>{m.teamB}</span>
          </div>
          <Badge tone={m.status === "live" ? "danger" : m.status === "completed" ? "success" : "accent"}>
            {m.status}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{formatDate(m.startTime)}</div>
        {m.venue && <div className="text-xs text-muted-foreground">📍 {m.venue}</div>}
        {completed && (m.matchWinner || m.scoreSummary) && (
          <div className="mt-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs">
            {m.matchWinner && (
              <div className="font-semibold text-success">🏆 {m.matchWinner} won</div>
            )}
            {m.scoreSummary && <div className="text-muted-foreground">{m.scoreSummary}</div>}
            <div className="mt-1 text-[11px] text-primary underline">View full results →</div>
          </div>
        )}
        <div className="flex gap-2 mt-3 flex-wrap">
          {m.doublePoints && <Badge tone="warning">2× Points</Badge>}
          {m.chaosMatch && <Badge tone="danger">Chaos</Badge>}
          {m.noBonus && <Badge tone="default">No Bonus</Badge>}
          {m.predictionMadness && <Badge tone="accent">Prediction Madness</Badge>}
        </div>
      </Card>
    </Link>
  );
}

export default async function MatchesPage() {
  await requireUser();
  await connectDB();
  const all = await Match.find().sort({ startTime: 1 }).lean();

  const upcoming = all
    .filter((m) => m.status !== "completed")
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
  const completed = all
    .filter((m) => m.status === "completed")
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Matches</h1>
        <p className="text-muted-foreground text-sm">All scheduled, live and completed games.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming & Live</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {upcoming.map((m) => (
            <MatchCard key={String(m._id)} m={m as unknown as MatchLean} />
          ))}
          {!upcoming.length && (
            <Card>
              <p className="text-muted-foreground text-sm">No upcoming matches.</p>
            </Card>
          )}
        </div>
      </section>

      {completed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Completed</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {completed.map((m) => (
              <MatchCard key={String(m._id)} m={m as unknown as MatchLean} completed />
            ))}
          </div>
        </section>
      )}

      {!all.length && (
        <Card>
          <p className="text-muted-foreground text-sm">No matches yet. Ask an admin to add one.</p>
        </Card>
      )}
    </div>
  );
}
