import type { RivalryHistoryEntry } from "@/actions/civil-war";

type Tone = "win" | "loss" | "tie" | "cancelled";

const TONE: Record<
  Tone,
  {
    statusLabel: string;
    statusDot: string;
    statusText: string;
    pointTone: string;
    border: string;
  }
> = {
  win: {
    statusLabel: "Won",
    statusDot: "bg-success",
    statusText: "text-success",
    pointTone: "text-success",
    border: "border-l-success",
  },
  loss: {
    statusLabel: "Lost",
    statusDot: "bg-destructive",
    statusText: "text-destructive",
    pointTone: "text-destructive",
    border: "border-l-destructive",
  },
  tie: {
    statusLabel: "Tied",
    statusDot: "bg-muted-foreground/50",
    statusText: "text-muted-foreground",
    pointTone: "text-muted-foreground",
    border: "border-l-muted-foreground/40",
  },
  cancelled: {
    statusLabel: "Withdrawn",
    statusDot: "bg-muted-foreground/40",
    statusText: "text-muted-foreground",
    pointTone: "text-muted-foreground",
    border: "border-l-muted-foreground/30",
  },
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function RivalryResult({ entry }: { entry: RivalryHistoryEntry }) {
  const tone: Tone = (["win", "loss", "tie", "cancelled"] as const).includes(
    entry.outcome as Tone
  )
    ? (entry.outcome as Tone)
    : "tie";
  const t = TONE[tone];
  const net = entry.pointsAwarded - entry.penalty;
  const iWon = tone === "win";
  const oppWon = tone === "loss";

  return (
    <div
      className={`group relative rounded-lg border border-l-4 ${t.border} bg-card overflow-hidden transition-colors hover:bg-muted/30`}
    >
      <div className="p-3 sm:p-3.5">
        {/* Top meta row */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`h-1.5 w-1.5 rounded-full ${t.statusDot}`} />
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${t.statusText}`}
            >
              {t.statusLabel}
            </span>
            <span className="text-muted-foreground/40 text-[10px]">•</span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {formatDateShort(entry.startTime)}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/70 capitalize shrink-0">
            {entry.myRole}
          </span>
        </div>

        {/* Match label */}
        <div className="text-[11px] sm:text-xs text-muted-foreground mb-3 truncate font-medium">
          {entry.matchLabel}
        </div>

        {/* Scoreboard */}
        <div className="flex items-center gap-3">
          {/* You side */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div
              className={`h-9 w-9 rounded-md flex items-center justify-center text-[10px] font-bold tracking-wider shrink-0 ${
                iWon
                  ? "bg-success/15 text-success ring-1 ring-success/30"
                  : "bg-primary/10 text-primary ring-1 ring-primary/25"
              }`}
            >
              YOU
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">You</div>
              {iWon && (
                <div className="text-[9px] font-bold uppercase tracking-wider text-success">
                  Winner
                </div>
              )}
            </div>
          </div>

          {/* Net points center */}
          <div className="flex flex-col items-center shrink-0 px-1">
            <span
              className={`text-xl sm:text-2xl font-bold tabular-nums leading-none ${t.pointTone}`}
            >
              {net > 0 ? "+" : ""}
              {net}
            </span>
            <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
              pts
            </span>
          </div>

          {/* Opponent side */}
          <div className="flex-1 min-w-0 flex items-center gap-2 justify-end text-right">
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">
                {entry.opponentUsername}
              </div>
              {oppWon && (
                <div className="text-[9px] font-bold uppercase tracking-wider text-destructive">
                  Winner
                </div>
              )}
            </div>
            <div
              className={`h-9 w-9 rounded-md flex items-center justify-center text-[10px] font-bold tracking-wider shrink-0 ${
                oppWon
                  ? "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                  : "bg-muted text-muted-foreground ring-1 ring-border"
              }`}
            >
              {initials(entry.opponentUsername)}
            </div>
          </div>
        </div>

        {/* FP comparison — explains "how he won" */}
        {entry.myFp !== null && entry.opponentFp !== null && (
          <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-center justify-between gap-2 text-[10px] sm:text-[11px]">
            <span className="text-muted-foreground">
              Fantasy points
            </span>
            <span className="tabular-nums">
              <span
                className={
                  iWon ? "font-semibold text-success" : "font-medium"
                }
              >
                {entry.myFp}
              </span>
              <span className="text-muted-foreground/50 mx-1.5">vs</span>
              <span
                className={
                  oppWon ? "font-semibold text-destructive" : "text-muted-foreground"
                }
              >
                {entry.opponentFp}
              </span>
              {(() => {
                const diff = (entry.myFp ?? 0) - (entry.opponentFp ?? 0);
                if (diff === 0) return null;
                const tone = diff > 0 ? "text-success" : "text-destructive";
                return (
                  <span className={`ml-1.5 font-semibold ${tone}`}>
                    ({diff > 0 ? "+" : ""}
                    {Math.round(diff * 10) / 10})
                  </span>
                );
              })()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
