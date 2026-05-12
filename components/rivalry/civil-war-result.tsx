import type { CivilWarHistoryEntry } from "@/actions/civil-war";

type Verdict = {
  text: string;
  detail: string;
  tone: "win" | "loss" | "draw" | "neutral";
};

function getVerdict(entry: CivilWarHistoryEntry): Verdict {
  const o = entry.outcome;
  const mySide = entry.mySide;

  if (o === "A_decisive" || o === "B_decisive") {
    const iWon =
      (o === "A_decisive" && mySide === "A") || (o === "B_decisive" && mySide === "B");
    return {
      text: iWon ? "Decisive win" : "Decisive loss",
      detail: iWon
        ? "Your team won more rivalries AND scored more combined fantasy points."
        : "The other team won more rivalries AND scored more combined fantasy points.",
      tone: iWon ? "win" : "loss",
    };
  }
  if (o === "A_split" || o === "B_split") {
    const iWon =
      (o === "A_split" && mySide === "A") || (o === "B_split" && mySide === "B");
    return {
      text: iWon ? "Split win" : "Split loss",
      detail: iWon
        ? "Your team won more rivalries but the FP totals were close."
        : "The other team won more rivalries but the FP totals were close.",
      tone: iWon ? "win" : "loss",
    };
  }
  if (o === "A_fp_tiebreak" || o === "B_fp_tiebreak") {
    const iWon =
      (o === "A_fp_tiebreak" && mySide === "A") ||
      (o === "B_fp_tiebreak" && mySide === "B");
    return {
      text: iWon ? "Tiebreak win" : "Tiebreak loss",
      detail: iWon
        ? "Rivalries were tied — your team won on combined fantasy points."
        : "Rivalries were tied — the other team won on combined fantasy points.",
      tone: iWon ? "win" : "loss",
    };
  }
  if (o === "draw") {
    return {
      text: "Perfect draw",
      detail: "Both sides finished level on rivalries and combined fantasy points.",
      tone: "draw",
    };
  }
  // legacy outcome names (older docs may still have them)
  if (o === "A_won_clear" || o === "B_won_clear") {
    const iWon =
      (o === "A_won_clear" && mySide === "A") ||
      (o === "B_won_clear" && mySide === "B");
    return {
      text: iWon ? "Victory" : "Defeat",
      detail: iWon
        ? "Your team won the war."
        : "The other team won the war.",
      tone: iWon ? "win" : "loss",
    };
  }
  return {
    text: "Not eligible",
    detail: "Civil War didn't run — fewer than 2 accepted rivalries on this match.",
    tone: "neutral",
  };
}

const TONE_RING: Record<Verdict["tone"], string> = {
  win: "ring-success/40 bg-success/5",
  loss: "ring-destructive/40 bg-destructive/5",
  draw: "ring-border bg-muted/20",
  neutral: "ring-border bg-muted/20",
};

const TONE_CHIP: Record<Verdict["tone"], string> = {
  win: "bg-success/15 text-success border-success/40",
  loss: "bg-destructive/15 text-destructive border-destructive/40",
  draw: "bg-muted text-muted-foreground border-border",
  neutral: "bg-muted text-muted-foreground border-border",
};

function fmtPpm(n: number): { text: string; cls: string } {
  if (n > 0) return { text: `+${n}`, cls: "text-success" };
  if (n < 0) return { text: `${n}`, cls: "text-destructive" };
  return { text: "0", cls: "text-muted-foreground" };
}

export function CivilWarResult({
  entry,
  showHeader = true,
}: {
  entry: CivilWarHistoryEntry;
  showHeader?: boolean;
}) {
  const verdict = getVerdict(entry);
  const teamATotalFp = entry.teamAMembers.reduce((s, m) => s + m.fantasyPoints, 0);
  const teamBTotalFp = entry.teamBMembers.reduce((s, m) => s + m.fantasyPoints, 0);

  const aPpm = fmtPpm(entry.teamAPointsPerMember);
  const bPpm = fmtPpm(entry.teamBPointsPerMember);

  const sideMeta = (side: "A" | "B") => ({
    name: side === "A" ? entry.teamAName : entry.teamBName,
    total: side === "A" ? teamATotalFp : teamBTotalFp,
    members: side === "A" ? entry.teamAMembers : entry.teamBMembers,
    ppm: side === "A" ? entry.teamAPointsPerMember : entry.teamBPointsPerMember,
    ppmFmt: side === "A" ? aPpm : bPpm,
    isMine: entry.mySide === side,
  });

  const a = sideMeta("A");
  const b = sideMeta("B");

  return (
    <div className={`rounded-2xl border bg-card overflow-hidden ring-1 ${TONE_RING[verdict.tone]}`}>
      {showHeader && (
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border/60 bg-muted/20">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm sm:text-base truncate">
                {entry.matchLabel}
              </div>
              <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                {new Date(entry.startTime).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {" · "}
                You played on <strong>{entry.myTeamName}</strong>
                {entry.wasCaptain && " 👑"}
              </div>
            </div>
            <span
              className={`text-[11px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${TONE_CHIP[verdict.tone]}`}
            >
              {verdict.text}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-2 leading-relaxed">
            {verdict.detail}
          </p>
        </div>
      )}

      {/* Team summary cards */}
      <div className="grid grid-cols-2 gap-px bg-border/60">
        {([a, b] as const).map((t) => (
          <div
            key={t.name}
            className={`px-3 sm:px-4 py-3 ${t.isMine ? "bg-primary/5" : "bg-card"}`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  t.isMine ? "bg-primary" : "bg-muted-foreground/40"
                }`}
              />
              <span className="font-semibold text-sm truncate">{t.name}</span>
              {t.isMine && (
                <span className="text-[10px] text-primary font-medium">(yours)</span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-bold tabular-nums">
                {t.total}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                total fp
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1 text-[11px]">
              <span className="text-muted-foreground">War points/member:</span>
              <span className={`font-bold tabular-nums ${t.ppmFmt.cls}`}>
                {t.ppmFmt.text}
              </span>
              {t.isMine && entry.captainBonusApplied && (
                <span className="ml-1 text-success">
                  +{entry.captainBonusPerMember} captain bonus
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Member breakdown */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-t border-border/60">
        <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Squad fantasy points
        </div>
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
          <table className="w-full text-xs sm:text-sm min-w-[420px] border-separate border-spacing-y-1">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium pb-1 pr-2">{a.name}</th>
                <th className="text-right font-medium pb-1 pl-2">FP</th>
                <th className="w-4" />
                <th className="text-left font-medium pb-1 pr-2">{b.name}</th>
                <th className="text-right font-medium pb-1 pl-2">FP</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({
                length: Math.max(a.members.length, b.members.length),
              }).map((_, i) => {
                const ma = a.members[i];
                const mb = b.members[i];
                const renderName = (
                  m: (typeof a.members)[number] | undefined
                ) => {
                  if (!m) return <span className="text-muted-foreground/60">—</span>;
                  return (
                    <span
                      className={`inline-flex items-center gap-1 min-w-0 ${
                        m.isMe ? "text-primary font-semibold" : ""
                      }`}
                    >
                      {m.isCaptain && (
                        <span
                          className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-amber-500/15 text-amber-500 text-[9px] font-bold ring-1 ring-amber-500/30 shrink-0"
                          title="Captain"
                        >
                          C
                        </span>
                      )}
                      <span className="truncate">{m.username}</span>
                      {m.isMe && (
                        <span className="text-[9px] text-primary/80 font-medium">
                          (you)
                        </span>
                      )}
                    </span>
                  );
                };
                return (
                  <tr key={i}>
                    <td
                      className={`py-1.5 pr-2 pl-2 ${
                        ma?.isMe ? "bg-primary/10 rounded-l-md" : ""
                      }`}
                    >
                      {renderName(ma)}
                    </td>
                    <td
                      className={`py-1.5 pl-2 pr-2 text-right tabular-nums ${
                        ma?.isCaptain ? "font-semibold" : ""
                      } ${ma?.isMe ? "bg-primary/10 rounded-r-md" : ""}`}
                    >
                      {ma ? ma.fantasyPoints : ""}
                    </td>
                    <td className="text-center text-muted-foreground/40 text-[10px]">
                      ·
                    </td>
                    <td
                      className={`py-1.5 pr-2 pl-2 ${
                        mb?.isMe ? "bg-primary/10 rounded-l-md" : ""
                      }`}
                    >
                      {renderName(mb)}
                    </td>
                    <td
                      className={`py-1.5 pl-2 pr-2 text-right tabular-nums ${
                        mb?.isCaptain ? "font-semibold" : ""
                      } ${mb?.isMe ? "bg-primary/10 rounded-r-md" : ""}`}
                    >
                      {mb ? mb.fantasyPoints : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-[11px]">
                <td className="pt-2 pr-2 pl-2 text-muted-foreground font-medium">
                  Total
                </td>
                <td className="pt-2 pl-2 pr-2 text-right font-bold tabular-nums">
                  {a.total}
                </td>
                <td />
                <td className="pt-2 pr-2 pl-2 text-muted-foreground font-medium">
                  Total
                </td>
                <td className="pt-2 pl-2 pr-2 text-right font-bold tabular-nums">
                  {b.total}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-amber-500/15 text-amber-500 text-[8px] font-bold ring-1 ring-amber-500/30 mr-1">
            C
          </span>
          marks each side&apos;s captain. Captains aren&apos;t paired against
          each other — they just lead their team.
        </p>
      </div>

      {/* Leader topper override */}
      {entry.leaderTopperUserId && entry.leaderTopperBonus > 0 && (
        <div className="mx-4 sm:mx-5 mb-3 sm:mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] sm:text-xs">
          <div className="font-semibold text-amber-500 mb-0.5">
            ⚡ Leader topper override
          </div>
          <div className="text-muted-foreground">
            {entry.leaderTopperUsername ?? "The overall leaderboard #1"} wasn&apos;t in
            this war but outscored both captains, earning{" "}
            <span className="font-semibold text-foreground">
              +{entry.leaderTopperBonus}
            </span>
            .
          </div>
        </div>
      )}

      {/* Your take footer */}
      <div className="px-4 sm:px-5 py-3 border-t border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs">
        <div className="text-muted-foreground">
          {entry.wasCaptain ? (
            <>
              <span className="text-amber-500 font-semibold">👑 You captained</span>{" "}
              <span>{entry.myTeamName}</span>
            </>
          ) : (
            <>
              Played on{" "}
              <span className="font-medium text-foreground">{entry.myTeamName}</span>
            </>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-muted-foreground">Your take:</span>
          <span
            className={`text-base sm:text-lg font-bold tabular-nums ${
              entry.myPoints > 0
                ? "text-success"
                : entry.myPoints < 0
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {entry.myPoints > 0 ? "+" : ""}
            {entry.myPoints}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            pts
          </span>
        </div>
      </div>
    </div>
  );
}
