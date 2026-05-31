import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { FantasyTeam } from "@/models/FantasyTeam";
import { requireUser } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { formatDate } from "@/lib/utils";
import { autoUpdateMatchStatuses } from "@/services/match-status";

export const dynamic = "force-dynamic";

export default async function FantasyIndexPage() {
  const me = await requireUser();
  await connectDB();
  await autoUpdateMatchStatuses();

  const matches = await Match.find()
    .sort({ startTime: 1 })
    .select("teamA teamB teamAShort teamBShort startTime status venue players")
    .lean();

  const myTeams = await FantasyTeam.find({ userId: me._id })
    .select("matchId totalPoints players subs")
    .lean();
  const teamByMatch = new Map(
    myTeams.map((t) => [String(t.matchId), t])
  );

  // For each match, how many of the user's XI are currently bench / impact
  // (post-toss). Used to nudge them to set backups before lock.
  function statusCounts(m: (typeof matches)[number], team: (typeof myTeams)[number] | undefined) {
    if (!team) return { bench: 0, impact: 0, announced: false };
    const roster = m.players ?? [];
    const announced = roster.some((p) => p.playingStatus);
    if (!announced) return { bench: 0, impact: 0, announced: false };
    const byKey = new Map(roster.map((p) => [p.profileId ?? p.name, p]));
    let bench = 0;
    let impact = 0;
    for (const p of team.players) {
      const r = byKey.get(p.profileId ?? p.name);
      if (!r) continue;
      if (r.playingXIChange === "IN") impact += 1;
      else if (r.playingStatus === "bench") bench += 1;
    }
    return { bench, impact, announced };
  }

  const now = Date.now();
  const upcoming = matches.filter((m) => m.status !== "completed");
  const completed = matches
    .filter((m) => m.status === "completed")
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));

  function Row({ m }: { m: (typeof matches)[number] }) {
    const id = String(m._id);
    const mine = teamByMatch.get(id);
    const started = now >= +new Date(m.startTime);
    const sc = statusCounts(m, mine);
    return (
      <Link href={`/fantasy/${id}`}>
        <Card className="hover:scale-[1.01] transition cursor-pointer">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center flex-wrap gap-2 text-base font-bold min-w-0">
              <TeamLogo name={m.teamA} size={22} />
              <span className="truncate">{m.teamAShort ?? m.teamA}</span>
              <span className="text-muted-foreground text-xs">vs</span>
              <TeamLogo name={m.teamB} size={22} />
              <span className="truncate">{m.teamBShort ?? m.teamB}</span>
            </div>
            <Badge
              tone={
                m.status === "live"
                  ? "danger"
                  : m.status === "completed"
                  ? "success"
                  : "accent"
              }
            >
              {m.status}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
            {formatDate(m.startTime)}
          </div>
          <div className="mt-3 flex items-center justify-between">
            {mine ? (
              <Badge tone="success">
                Team saved{m.status !== "upcoming" ? ` · ${mine.totalPoints} pts` : ""}
              </Badge>
            ) : started ? (
              <Badge tone="default">No team</Badge>
            ) : (
              <Badge tone="warning">Pick your XI</Badge>
            )}
            <span className="text-[11px] text-primary underline">
              {started ? "View team →" : mine ? "Edit team →" : "Create team →"}
            </span>
          </div>
          {mine && sc.announced && (sc.bench > 0 || sc.impact > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2 text-[11px]">
              <span className="text-muted-foreground">In your XI:</span>
              {sc.bench > 0 && <Badge tone="warning">{sc.bench} on bench</Badge>}
              {sc.impact > 0 && <Badge tone="accent">{sc.impact} impact</Badge>}
              {(mine.subs?.length ?? 0) > 0 ? (
                <span className="text-muted-foreground">· backups will cover them</span>
              ) : (
                !started && <span className="text-warning">· add backups!</span>
              )}
            </div>
          )}
        </Card>
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Fantasy XI</h1>
        <p className="text-muted-foreground text-sm">
          Pick 11 players, a captain (2×) and a vice-captain (1.5×) before each
          match starts. Points are scored live from the match.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming & Live</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {upcoming.map((m) => (
            <Row key={String(m._id)} m={m} />
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
              <Row key={String(m._id)} m={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
