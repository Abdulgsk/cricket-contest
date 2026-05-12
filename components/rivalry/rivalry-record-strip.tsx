import type { RivalryRecord } from "@/actions/civil-war";
import { Card } from "@/components/ui/card";

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function outcomeLabel(o: string): { label: string; cls: string } {
  if (o === "win" || o === "A_won_clear" || o === "B_won_clear") {
    return { label: "WIN", cls: "bg-success/15 text-success border-success/30" };
  }
  if (o === "loss") {
    return { label: "LOSS", cls: "bg-destructive/15 text-destructive border-destructive/30" };
  }
  if (
    o === "tie" ||
    o === "draw" ||
    o === "A_won_no_win_lead" ||
    o === "B_won_no_win_lead"
  ) {
    return {
      label: o === "tie" ? "TIE" : "DRAW",
      cls: "bg-muted text-muted-foreground border-border",
    };
  }
  if (o === "cancelled") {
    return { label: "WD", cls: "bg-muted text-muted-foreground border-border" };
  }
  if (o === "not_eligible") {
    return { label: "N/A", cls: "bg-muted text-muted-foreground border-border" };
  }
  return { label: o.toUpperCase(), cls: "bg-muted text-muted-foreground border-border" };
}

export function RivalryRecordStrip({
  record,
  mode = "both",
}: {
  record: RivalryRecord;
  mode?: "rivalry" | "civilwar" | "both";
}) {
  const { rivalry, civilWar, recentRivalries, recentCivilWars } = record;
  const showRivalry = mode === "rivalry" || mode === "both";
  const showCivilWar = mode === "civilwar" || mode === "both";
  const totalWins =
    (showRivalry ? rivalry.wins : 0) + (showCivilWar ? civilWar.wins : 0);
  const totalLosses =
    (showRivalry ? rivalry.losses : 0) + (showCivilWar ? civilWar.losses : 0);
  const totalDraws =
    (showRivalry ? rivalry.ties : 0) + (showCivilWar ? civilWar.draws : 0);
  const totalPoints =
    (showRivalry ? rivalry.points : 0) + (showCivilWar ? civilWar.points : 0);

  const hasRivalryData = recentRivalries.length > 0;
  const hasCivilWarData = recentCivilWars.length > 0;
  if (
    (mode === "rivalry" && !hasRivalryData) ||
    (mode === "civilwar" && !hasCivilWarData) ||
    (mode === "both" && !hasRivalryData && !hasCivilWarData)
  ) {
    return null;
  }

  const title =
    mode === "rivalry"
      ? "📊 Your 1v1 record"
      : mode === "civilwar"
        ? "📊 Your Civil War record"
        : "📊 Your record";

  return (
    <Card className="border-primary/20">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded border border-success/30 bg-success/10 text-success">
            {totalWins}W
          </span>
          <span className="px-2 py-0.5 rounded border border-destructive/30 bg-destructive/10 text-destructive">
            {totalLosses}L
          </span>
          <span className="px-2 py-0.5 rounded border border-border bg-muted text-muted-foreground">
            {totalDraws}D
          </span>
          <span className="px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary font-semibold">
            {totalPoints >= 0 ? "+" : ""}
            {totalPoints} pts
          </span>
        </div>
      </div>

      {mode === "both" && (
        <div className="grid grid-cols-2 gap-2 mb-3 text-[11px]">
          <div className="rounded-md border bg-card/50 px-2 py-1.5">
            <div className="font-semibold text-xs mb-0.5">1v1 Rivalry</div>
            <div className="text-muted-foreground">
              {rivalry.wins}W · {rivalry.losses}L · {rivalry.ties}T
              {rivalry.pending > 0 && ` · ${rivalry.pending} pending`}
              {" · "}
              <span className="text-primary font-semibold">
                {rivalry.points >= 0 ? "+" : ""}
                {rivalry.points}
              </span>
            </div>
            {rivalry.adminWithdrawn > 0 && (
              <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                {rivalry.adminWithdrawn} admin-approved withdrawal
                {rivalry.adminWithdrawn === 1 ? "" : "s"} (no penalty)
              </div>
            )}
          </div>
          <div className="rounded-md border bg-card/50 px-2 py-1.5">
            <div className="font-semibold text-xs mb-0.5">Civil War</div>
            <div className="text-muted-foreground">
              {civilWar.wins}W · {civilWar.losses}L · {civilWar.draws}D{" · "}
              <span className="text-primary font-semibold">+{civilWar.points}</span>
            </div>
          </div>
        </div>
      )}

      {mode === "rivalry" && rivalry.pending + rivalry.adminWithdrawn > 0 && (
        <div className="mb-3 text-[11px] text-muted-foreground">
          {rivalry.pending > 0 && (
            <span>
              {rivalry.pending} pending challenge
              {rivalry.pending === 1 ? "" : "s"}
            </span>
          )}
          {rivalry.pending > 0 && rivalry.adminWithdrawn > 0 && " · "}
          {rivalry.adminWithdrawn > 0 && (
            <span>
              {rivalry.adminWithdrawn} admin-approved withdrawal
              {rivalry.adminWithdrawn === 1 ? "" : "s"} (no penalty)
            </span>
          )}
        </div>
      )}

      {showCivilWar && recentCivilWars.length > 0 && (
        <div className={showRivalry ? "mb-3" : ""}>
          <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            Civil Wars
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {recentCivilWars.map((cw) => {
              const o = outcomeLabel(
                cw.outcome.startsWith("A_") && cw.mySide === "A"
                  ? "win"
                  : cw.outcome.startsWith("B_") && cw.mySide === "B"
                    ? "win"
                    : cw.outcome === "draw" || cw.outcome === "not_eligible"
                      ? "draw"
                      : "loss"
              );
              return (
                <div
                  key={cw.matchId}
                  className="shrink-0 w-[150px] rounded-md border bg-card/40 px-2 py-1.5 text-[11px]"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`px-1.5 py-0 rounded border text-[10px] font-bold ${o.cls}`}>
                      {o.label}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDateShort(cw.startTime)}
                    </span>
                  </div>
                  <div className="font-medium truncate" title={cw.matchLabel}>
                    {cw.matchLabel}
                  </div>
                  <div className="text-muted-foreground truncate" title={cw.myTeamName}>
                    {cw.wasCaptain && "👑 "}
                    {cw.myTeamName}
                  </div>
                  <div className="text-primary font-semibold">+{cw.myPoints} fp</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showRivalry && recentRivalries.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
            1v1 Rivalries
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {recentRivalries.map((r) => {
              const o = outcomeLabel(r.outcome);
              return (
                <div
                  key={r.rivalryId}
                  className="shrink-0 w-[150px] rounded-md border bg-card/40 px-2 py-1.5 text-[11px]"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`px-1.5 py-0 rounded border text-[10px] font-bold ${o.cls}`}>
                      {o.label}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDateShort(r.startTime)}
                    </span>
                  </div>
                  <div className="font-medium truncate" title={r.matchLabel}>
                    {r.matchLabel}
                  </div>
                  <div className="text-muted-foreground truncate">
                    vs {r.opponentUsername}
                  </div>
                  <div className="text-primary font-semibold">
                    {r.outcome === "win" && `+${r.pointsAwarded}`}
                    {r.outcome === "cancelled" && r.penalty > 0 && `−${r.penalty}`}
                    {r.outcome !== "win" &&
                      !(r.outcome === "cancelled" && r.penalty > 0) &&
                      "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
