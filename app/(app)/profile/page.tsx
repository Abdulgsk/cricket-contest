import { requireUser } from "@/lib/rbac";
import { Badge, Card } from "@/components/ui/card";
import { ProfileForms } from "@/components/profile-forms";
import { getMyRivalryAndCivilWarRecord } from "@/actions/civil-war";
import { RivalryRecordStrip } from "@/components/rivalry/rivalry-record-strip";

export default async function ProfilePage() {
  const me = await requireUser();
  const record = await getMyRivalryAndCivilWarRecord();
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">{me.username}</h1>
          <p className="text-muted-foreground text-sm truncate">@{me.userId}</p>
        </div>
        <Badge tone={me.role === "superadmin" ? "warning" : me.role === "admin" ? "accent" : "default"}>
          {me.role}
        </Badge>
      </header>
      <ProfileForms
        initial={{
          username: me.username,
          whatsapp: me.whatsapp,
          my11circleName: me.my11circleName,
        }}
      />
      <RivalryRecordStrip record={record} />

      {(record.recentRivalries.length > 0 || record.recentCivilWars.length > 0) && (
        <Card>
          <h2 className="font-semibold mb-3">📜 Match-by-match history</h2>
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-xs sm:text-sm min-w-[520px]">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground text-left">
                <tr>
                  <th className="p-2">Match</th>
                  <th className="p-2">Rivalry</th>
                  <th className="p-2">Civil War</th>
                  <th className="p-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const byMatch = new Map<
                    string,
                    {
                      matchId: string;
                      matchLabel: string;
                      startTime: string;
                      riv?: (typeof record.recentRivalries)[number];
                      cw?: (typeof record.recentCivilWars)[number];
                    }
                  >();
                  for (const r of record.recentRivalries) {
                    byMatch.set(r.matchId, {
                      matchId: r.matchId,
                      matchLabel: r.matchLabel,
                      startTime: r.startTime,
                      riv: r,
                    });
                  }
                  for (const c of record.recentCivilWars) {
                    const existing = byMatch.get(c.matchId);
                    if (existing) existing.cw = c;
                    else
                      byMatch.set(c.matchId, {
                        matchId: c.matchId,
                        matchLabel: c.matchLabel,
                        startTime: c.startTime,
                        cw: c,
                      });
                  }
                  const rows = Array.from(byMatch.values()).sort(
                    (a, b) =>
                      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
                  );
                  return rows.map((row) => {
                    const pts =
                      (row.riv?.outcome === "win" ? row.riv.pointsAwarded : 0) -
                      (row.riv?.penalty ?? 0) +
                      (row.cw?.myPoints ?? 0);
                    return (
                      <tr key={row.matchId} className="border-t border-border/50">
                        <td className="p-2">
                          <div className="font-medium">{row.matchLabel}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(row.startTime).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                        </td>
                        <td className="p-2">
                          {row.riv ? (
                            <>
                              <span
                                className={
                                  row.riv.outcome === "win"
                                    ? "text-success font-semibold"
                                    : row.riv.outcome === "loss"
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                                }
                              >
                                {row.riv.outcome.toUpperCase()}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                vs {row.riv.opponentUsername}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          {row.cw ? (
                            <>
                              {row.cw.wasCaptain && (
                                <span className="text-amber-500 mr-1">👑</span>
                              )}
                              <span className="text-muted-foreground">
                                {row.cw.myTeamName}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <span
                            className={
                              pts > 0
                                ? "text-success font-semibold"
                                : pts < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }
                          >
                            {pts > 0 ? "+" : ""}
                            {pts}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
