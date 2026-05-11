import { getRivalryView } from "@/actions/rivalry";
import { Card } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { formatDate } from "@/lib/utils";
import { RivalryMatchPanel } from "@/components/rivalry/rivalry-match-panel";

export default async function RivalryPage() {
  const view = await getRivalryView();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">⚔️ Rivalry</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Challenge another player for a specific match. Finish above them and earn{" "}
          <strong>+3</strong>. Withdraw before match start costs <strong>−2</strong>. One
          challenge per player per match.
        </p>
      </header>

      {view.matches.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">
            No upcoming matches today. Come back when a fixture is scheduled.
          </p>
        </Card>
      )}

      {view.matches.map((m) => (
        <Card key={m.id}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3">
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 font-bold text-sm sm:text-base">
                <TeamLogo name={m.teamA} size={22} />
                <span className="break-words">{m.teamA}</span>
                <span className="text-muted-foreground text-xs">vs</span>
                <TeamLogo name={m.teamB} size={22} />
                <span className="break-words">{m.teamB}</span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                {formatDate(m.startTime)} · {m.status}
                {m.rivalryLocked &&
                  (m.rivalryLockReason === "waiting_prior"
                    ? " · ⏳ waiting for earlier match"
                    : " · 🔒 locked")}
              </p>
            </div>
          </div>
          <RivalryMatchPanel
            matchId={m.id}
            meId={view.meId}
            rivalryLocked={m.rivalryLocked}
            rivalryLockReason={m.rivalryLockReason}
            unfinishedPriors={m.unfinishedPriors}
            eligibleOpponents={m.eligibleOpponents}
            busyPlayers={m.busyPlayers}
            myActive={m.myActive}
            all={m.all}
          />
        </Card>
      ))}
    </div>
  );
}
