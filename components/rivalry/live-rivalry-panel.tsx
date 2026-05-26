"use client";

import { TeamLogo } from "@/components/team-logo";
import { UserAvatar } from "@/components/user-avatar";
import {
  useLiveCivilWar,
  type LiveMember,
} from "@/components/rivalry/use-live-civil-war";

type Player = { userId: string; username: string; avatar: string | null };

function timeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/**
 * Live fantasy-points panel for an accepted rivalry on a live match.
 *
 * Reuses the civil-war live endpoint (every accepted rivalry slots both
 * players into the match's Civil War). Auto-refreshes every 20s via
 * useLiveCivilWar; manual refresh has a 30s cooldown.
 */
export function LiveRivalryPanel({
  me,
  opponent,
  match,
}: {
  me: Player;
  opponent: Player;
  match: {
    id: string;
    label: string;
    startTime: string;
    teamA: string;
    teamB: string;
  };
}) {
  const live = useLiveCivilWar(match.id);

  let meHit: LiveMember | null = null;
  let oppHit: LiveMember | null = null;
  let lastUpdated: string | null = null;
  let unavailableReason: string | null = null;
  let loading = live.loading;

  if (live.data && "ok" in live.data && live.data.ok) {
    if ("available" in live.data && live.data.available) {
      const all = [
        ...live.data.teamA.members,
        ...live.data.teamB.members,
      ];
      meHit = all.find((m) => m.userId === me.userId) ?? null;
      oppHit = all.find((m) => m.userId === opponent.userId) ?? null;
      lastUpdated = live.data.lastUpdated;
      loading = false;
    } else if ("reason" in live.data) {
      unavailableReason = humanReason(live.data.reason);
      loading = false;
    }
  } else if (live.data && "ok" in live.data && !live.data.ok) {
    unavailableReason = live.data.error;
    loading = false;
  }

  const myFp = meHit?.fantasyPoints ?? null;
  const oppFp = oppHit?.fantasyPoints ?? null;
  const diff = myFp !== null && oppFp !== null ? myFp - oppFp : null;
  const leader: "me" | "opp" | "tie" | null =
    diff === null
      ? null
      : diff > 0
        ? "me"
        : diff < 0
          ? "opp"
          : "tie";

  // Tug-of-war split based on FP share. 50/50 when missing or both zero.
  const total = (myFp ?? 0) + (oppFp ?? 0);
  const mySharePct =
    myFp === null || oppFp === null
      ? 50
      : total === 0
        ? 50
        : Math.round((myFp / total) * 100);
  const oppSharePct = 100 - mySharePct;

  const cooldownSec = Math.ceil(live.cooldownLeftMs / 1000);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4 text-xs text-muted-foreground animate-pulse">
        Tuning into live points…
      </div>
    );
  }

  if (unavailableReason) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground">
        {unavailableReason}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/30 shadow-sm">
      {/* glow accents */}
      <div className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full bg-success/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

      {/* Header strip */}
      <div className="relative flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative inline-flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success/60 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
            Live rivalry
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {lastUpdated && (
            <span suppressHydrationWarning className="tabular-nums">
              Updated {timeAgo(lastUpdated, live.now)}
            </span>
          )}
          <button
            type="button"
            onClick={live.refresh}
            disabled={!live.canRefresh}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
            title={
              !live.canRefresh && live.cooldownLeftMs > 0
                ? `Wait ${cooldownSec}s before refreshing`
                : "Refresh now"
            }
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-3 w-3 ${live.refreshing ? "animate-spin" : ""}`}
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
              {live.cooldownLeftMs > 0 ? `${cooldownSec}s` : "Refresh"}
            </span>
          </button>
        </div>
      </div>

      {/* Match label */}
      <div className="relative px-3 sm:px-4 pt-2.5 text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <TeamLogo name={match.teamA} size={14} />
        <span className="truncate font-medium">{match.teamA}</span>
        <span className="opacity-60">vs</span>
        <TeamLogo name={match.teamB} size={14} />
        <span className="truncate font-medium">{match.teamB}</span>
      </div>

      {/* Scoreboard */}
      <div className="relative px-3 sm:px-4 pt-3">
        <div className="flex items-center gap-3">
          {/* Me */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <UserAvatar
              src={me.avatar}
              name={me.username}
              profileId={me.userId}
              size={40}
              className={
                leader === "me"
                  ? "ring-2 ring-success/50"
                  : "ring-1 ring-border"
              }
            />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold truncate text-muted-foreground uppercase tracking-wider">
                You
              </div>
              <div
                className={`text-xl sm:text-2xl font-black tabular-nums leading-none ${
                  leader === "me" ? "text-success" : "text-foreground"
                }`}
              >
                {myFp ?? "—"}
                {meHit?.isCaptain && (
                  <span className="ml-1 text-[10px] align-top text-warning">
                    C
                  </span>
                )}
              </div>
              {meHit && !meHit.matched && (
                <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                  my11 not linked
                </div>
              )}
            </div>
          </div>

          {/* Diff */}
          <div className="flex flex-col items-center shrink-0 px-1">
            <span
              className={
                "text-xl sm:text-2xl font-black tabular-nums leading-none " +
                (leader === "me"
                  ? "text-success"
                  : leader === "opp"
                    ? "text-destructive"
                    : "text-muted-foreground")
              }
            >
              {diff === null
                ? "—"
                : diff > 0
                  ? `+${diff}`
                  : diff === 0
                    ? "="
                    : `${diff}`}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mt-0.5">
              gap
            </span>
          </div>

          {/* Opponent */}
          <div className="flex-1 min-w-0 flex items-center gap-2 justify-end text-right">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold truncate text-muted-foreground uppercase tracking-wider">
                {opponent.username}
              </div>
              <div
                className={`text-xl sm:text-2xl font-black tabular-nums leading-none ${
                  leader === "opp" ? "text-destructive" : "text-foreground"
                }`}
              >
                {oppFp ?? "—"}
                {oppHit?.isCaptain && (
                  <span className="ml-1 text-[10px] align-top text-warning">
                    C
                  </span>
                )}
              </div>
              {oppHit && !oppHit.matched && (
                <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                  my11 not linked
                </div>
              )}
            </div>
            <UserAvatar
              src={opponent.avatar}
              name={opponent.username}
              profileId={opponent.userId}
              size={40}
              className={
                leader === "opp"
                  ? "ring-2 ring-destructive/50"
                  : "ring-1 ring-border"
              }
            />
          </div>
        </div>

        {/* Tug-of-war bar */}
        <div className="mt-3 relative h-2.5 rounded-full bg-muted overflow-hidden flex shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-success/80 to-success transition-[width] duration-700 ease-out"
            style={{ width: `${mySharePct}%` }}
          />
          <div
            className="h-full bg-gradient-to-l from-destructive/80 to-destructive transition-[width] duration-700 ease-out"
            style={{ width: `${oppSharePct}%` }}
          />
          <div
            className="absolute inset-y-0 w-0.5 bg-background shadow-[0_0_0_1px_rgb(var(--border))] transition-[left] duration-700 ease-out"
            style={{ left: `calc(${mySharePct}% - 1px)` }}
          />
        </div>
      </div>

      {/* Status pill */}
      <div className="relative px-3 sm:px-4 pt-2.5 pb-3 flex justify-center">
        {leader === null ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border bg-muted/40 text-muted-foreground">
            Waiting for points
          </span>
        ) : leader === "tie" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-border bg-muted/40 text-muted-foreground">
            All level
          </span>
        ) : leader === "me" ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-success/40 bg-success/10 text-success">
            <span>You leading by</span>
            <span className="tabular-nums">{Math.abs(diff!)} FP</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-destructive/40 bg-destructive/10 text-destructive">
            <span className="truncate max-w-[8rem]">{opponent.username}</span>
            <span>ahead by</span>
            <span className="tabular-nums">{Math.abs(diff!)} FP</span>
          </span>
        )}
      </div>
    </div>
  );
}

function humanReason(reason: string): string {
  switch (reason) {
    case "no_contest":
      return "Live points appear once an admin links the My11 contest.";
    case "not_started":
      return "Live points unlock when the match goes live.";
    case "auth_expired":
      return "My11 session expired — admin needs to refresh the cookie.";
    case "not_ready":
      return "My11 hasn't published the leaderboard yet. Hang tight.";
    case "no_civil_war":
      return "No live feed for this match.";
    case "bad_contest_url":
      return "Live points are warming up — admin needs to attach the contest leaderboard link.";
    default:
      return "Live data unavailable.";
  }
}
