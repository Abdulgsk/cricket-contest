import { getRivalryView } from "@/actions/rivalry";
import {
  getCivilWarView,
  getMyRivalryAndCivilWarRecord,
} from "@/actions/civil-war";
import { Card } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { formatDate } from "@/lib/utils";
import { RivalryMatchPanel } from "@/components/rivalry/rivalry-match-panel";
import { CivilWarTab } from "@/components/rivalry/civil-war-tab";
import { RivalryPageTabs } from "@/components/rivalry/rivalry-page-tabs";
import { CivilWarResult } from "@/components/rivalry/civil-war-result";
import { RivalryResult } from "@/components/rivalry/rivalry-result";

export default async function RivalryPage() {
  const [view, civilWar, record] = await Promise.all([
    getRivalryView(),
    getCivilWarView(),
    getMyRivalryAndCivilWarRecord(),
  ]);

  const settledRivalries = record.recentRivalries.filter(
    (r) => r.outcome !== "pending"
  );

  const rivalryTab = (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">⚔️ Challenges</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Challenge another player for a specific match. <strong>+3</strong> for
          a win, <strong>−2</strong> for your own withdrawal — admin-approved
          withdrawals carry no penalty.
        </p>

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
                      : m.rivalryLockReason === "accepted"
                        ? " · 🔒 accepted rivalry lock"
                        : " · 🔒 locked")}
                </p>
              </div>
            </div>
            <RivalryMatchPanel
              matchId={m.id}
              rivalryLocked={m.rivalryLocked}
              rivalryLockReason={m.rivalryLockReason}
              unfinishedPriors={m.unfinishedPriors}
              eligibleOpponents={m.eligibleOpponents}
              myRivalries={m.myRivalries}
              all={m.all}
            />
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">📜 Results</h2>
          <span className="text-[11px] text-muted-foreground">
            {settledRivalries.length} settled
          </span>
        </div>
        {settledRivalries.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              No settled rivalries yet. Accept a challenge above to get started.
            </p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {settledRivalries.map((r) => (
              <RivalryResult key={r.rivalryId} entry={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const civilWarTab = (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">🛡️ Upcoming Civil Wars</h2>
        <CivilWarTab matches={civilWar.filter((m) => !m.settled)} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">📜 Results</h2>
          <span className="text-[11px] text-muted-foreground">
            {record.recentCivilWars.length} settled
          </span>
        </div>
        {record.recentCivilWars.length === 0 ? (
          <Card>
            <p className="text-xs sm:text-sm text-muted-foreground">
              No settled Civil Wars yet. Accept a rivalry on an upcoming match
              to be slotted into one.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {record.recentCivilWars.map((cw) => (
              <CivilWarResult key={cw.matchId} entry={cw} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">⚔️ Rivalry</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Active challenges and past results, in one place. Switch tabs for 1v1
          rivalries or team-vs-team Civil Wars.
        </p>
      </header>

      <RivalryPageTabs
        tabs={[
          { id: "rivalry", label: "Rivalry", icon: "⚔️", content: rivalryTab },
          { id: "civilwar", label: "Civil War", icon: "🛡️", content: civilWarTab },
        ]}
      />
    </div>
  );
}
