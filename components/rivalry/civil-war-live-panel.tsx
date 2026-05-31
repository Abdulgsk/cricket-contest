"use client";

import type { LiveResponse } from "@/components/rivalry/use-live-civil-war";

function timeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function CivilWarLivePanel({
  data,
  loading,
  refresh,
  canRefresh,
  cooldownLeftMs,
  refreshing,
  now,
  teamAName,
  teamBName,
}: {
  data: LiveResponse | null;
  loading: boolean;
  refresh: () => void;
  canRefresh: boolean;
  cooldownLeftMs: number;
  refreshing: boolean;
  now: number;
  teamAName: string;
  teamBName: string;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4 text-xs text-muted-foreground animate-pulse">
        Tuning into live points…
      </div>
    );
  }
  if (!data) return null;

  if (!data.ok) {
    return (
      <UnavailableShell>
        ⏱️ Live updates coming soon — warming up the scoreboard.
      </UnavailableShell>
    );
  }

  if (!data.available) {
    const msg =
      data.reason === "no_contest"
        ? "🛰️ Live points appear once an admin links the My11 contest."
        : data.reason === "bad_contest_url"
          ? "🛠️ Live points are warming up — admin needs to attach the contest leaderboard link."
          : data.reason === "not_started"
            ? "⏳ Live points unlock when the match goes live."
            : data.reason === "not_ready"
              ? "⏳ My11 hasn't published the leaderboard yet. Hang tight."
              : data.reason === "auth_expired"
                ? "🔑 My11 session expired — admin needs to refresh the cookie."
                : null;
    if (!msg) return null;
    return <UnavailableShell>{msg}</UnavailableShell>;
  }

  const { teamA, teamB, leader, leadFp, winProb, lastUpdated, mySide } = data;
  const cooldownSec = Math.ceil(cooldownLeftMs / 1000);

  const captainA = teamA.members.find((m) => m.isCaptain) ?? null;
  const captainB = teamB.members.find((m) => m.isCaptain) ?? null;
  const captainLead =
    captainA && captainB
      ? captainA.fantasyPoints === captainB.fantasyPoints
        ? "tie"
        : captainA.fantasyPoints > captainB.fantasyPoints
          ? "A"
          : "B"
      : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/30 shadow-sm">
      {/* glow accents */}
      <div className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

      {/* Header strip */}
      <div className="relative flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative inline-flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success/60 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
            Live battle
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span suppressHydrationWarning className="tabular-nums">
            Updated {timeAgo(lastUpdated, now)}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={!canRefresh}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
            title={
              !canRefresh && cooldownLeftMs > 0
                ? `Wait ${cooldownSec}s before refreshing`
                : "Refresh now"
            }
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 12a9 9 0 1 1-3.5-7.1" />
              <path d="M21 4v5h-5" />
            </svg>
            <span className="tabular-nums">
              {cooldownLeftMs > 0 ? `${cooldownSec}s` : "Refresh"}
            </span>
          </button>
        </div>
      </div>

      {/* Win % top */}
      <div className="relative px-4 pt-3">
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          <span>Win chance</span>
          <span>Win chance</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="text-left min-w-0">
            <div
              className={`text-2xl sm:text-3xl font-black tabular-nums leading-none ${
                leader === "A" ? "text-primary" : "text-foreground/70"
              }`}
            >
              {winProb.A}%
            </div>
            <div className="mt-1 text-[11px] font-semibold truncate max-w-[10rem]">
              {teamAName}
              {mySide === "A" && (
                <span className="ml-1 text-[9px] text-primary/80">(yours)</span>
              )}
            </div>
          </div>
          <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground pb-1">
            vs
          </div>
          <div className="text-right min-w-0">
            <div
              className={`text-2xl sm:text-3xl font-black tabular-nums leading-none ${
                leader === "B" ? "text-accent" : "text-foreground/70"
              }`}
            >
              {winProb.B}%
            </div>
            <div className="mt-1 text-[11px] font-semibold truncate max-w-[10rem]">
              {teamBName}
              {mySide === "B" && (
                <span className="ml-1 text-[9px] text-accent/80">(yours)</span>
              )}
            </div>
          </div>
        </div>

        {/* Tug-of-war bar — reflects win % so the boundary tracks the lead */}
        <div className="mt-3 relative h-2.5 rounded-full bg-muted overflow-hidden flex shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-primary/80 to-primary transition-[width] duration-700 ease-out"
            style={{ width: `${winProb.A}%` }}
          />
          <div
            className="h-full bg-gradient-to-l from-accent/80 to-accent transition-[width] duration-700 ease-out"
            style={{ width: `${winProb.B}%` }}
          />
          {/* moving marker — sits at the boundary between the two sides */}
          <div
            className="absolute inset-y-0 w-0.5 bg-background shadow-[0_0_0_1px_rgb(var(--border))] transition-[left] duration-700 ease-out"
            style={{ left: `calc(${winProb.A}% - 1px)` }}
          />
        </div>

        {/* Score row */}
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-bold tabular-nums">{teamA.totalFp}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            FP
          </span>
          <span className="font-bold tabular-nums">{teamB.totalFp}</span>
        </div>

        {/* Lead / trail line — from the user's perspective */}
        {mySide && (
          <div className="mt-2 flex justify-center">
            {(() => {
              const myName = mySide === "A" ? teamAName : teamBName;
              const oppName = mySide === "A" ? teamBName : teamAName;
              if (leader === "tie") {
                return (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border bg-muted/40 text-muted-foreground">
                    <span className="truncate max-w-[8rem]">{myName}</span>
                    <span>level with</span>
                    <span className="truncate max-w-[8rem]">{oppName}</span>
                  </span>
                );
              }
              const winning = leader === mySide;
              return (
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    winning
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}
                >
                  <span className="truncate max-w-[8rem]">{myName}</span>
                  <span>{winning ? "leading" : "trailing"}</span>
                  <span className="truncate max-w-[8rem]">{oppName}</span>
                  <span className="tabular-nums opacity-90">
                    by {leadFp} FP
                  </span>
                </span>
              );
            })()}
          </div>
        )}
        {!mySide && leader !== "tie" && (
          <div className="mt-2 flex justify-center">
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                leader === "A"
                  ? "border-primary/30 text-primary bg-primary/10"
                  : "border-accent/30 text-accent bg-accent/10"
              }`}
            >
              {leader === "A" ? teamAName : teamBName} leading by {leadFp} FP
            </span>
          </div>
        )}
      </div>

      {/* Captain duel — bottom */}
      {captainA && captainB && (
        <div className="relative mt-3 mx-3 mb-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
              👑 Captain duel
            </span>
            {captainLead === "tie" ? (
              <span className="text-[10px] font-semibold text-muted-foreground">
                Even
              </span>
            ) : captainLead ? (
              <span
                className={`text-[10px] font-semibold ${
                  captainLead === "A" ? "text-primary" : "text-accent"
                }`}
              >
                {captainLead === "A" ? captainA.username : captainB.username}{" "}
                ahead
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <CaptainCell
              member={captainA}
              side="A"
              leading={captainLead === "A"}
            />
            <span className="text-[10px] text-muted-foreground/70 px-1">×</span>
            <CaptainCell
              member={captainB}
              side="B"
              leading={captainLead === "B"}
              align="right"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CaptainCell({
  member,
  side,
  leading,
  align = "left",
}: {
  member: { username: string; fantasyPoints: number; matched: boolean };
  side: "A" | "B";
  leading: boolean;
  align?: "left" | "right";
}) {
  const tone = side === "A" ? "text-primary" : "text-accent";
  return (
    <div
      className={`flex-1 min-w-0 flex items-center gap-2 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <div
        className={`shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full text-[10px] font-black ${
          side === "A"
            ? "bg-primary/15 text-primary ring-1 ring-primary/30"
            : "bg-accent/15 text-accent ring-1 ring-accent/30"
        } ${leading ? "shadow-[0_0_0_3px_rgb(var(--ring)/0.15)]" : ""}`}
      >
        C
      </div>
      <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
        <div className="text-xs font-semibold truncate">{member.username}</div>
        <div className={`text-base font-black tabular-nums leading-none ${tone}`}>
          {member.fantasyPoints}
          {!member.matched && (
            <span className="ml-1 text-[9px] font-medium text-muted-foreground/70">
              no team
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function UnavailableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}
