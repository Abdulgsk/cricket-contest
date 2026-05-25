"use client";

import { TeamLogo } from "@/components/team-logo";
import { UserAvatar } from "@/components/user-avatar";
import { useLiveCivilWar } from "@/components/rivalry/use-live-civil-war";

type Player = { userId: string; username: string; avatar: string | null };

/**
 * Live fantasy-points panel for an accepted rivalry on a live match.
 *
 * Reuses the civil-war live endpoint (every accepted rivalry slots both
 * players into the match's Civil War, so the same feed already has both
 * users' fantasy points). We just pluck out me + opponent and render a
 * focused head-to-head card that updates every ~20s.
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

  // Pull both players' current FP from the live response.
  let myFp: number | null = null;
  let oppFp: number | null = null;
  let lastUpdated: string | null = null;
  let unavailableReason: string | null = null;
  if (live.data && "ok" in live.data && live.data.ok) {
    if ("available" in live.data && live.data.available) {
      const all = [
        ...live.data.teamA.members,
        ...live.data.teamB.members,
      ];
      const meHit = all.find((m) => m.userId === me.userId);
      const oppHit = all.find((m) => m.userId === opponent.userId);
      myFp = meHit?.fantasyPoints ?? null;
      oppFp = oppHit?.fantasyPoints ?? null;
      lastUpdated = live.data.lastUpdated;
    } else if ("reason" in live.data) {
      unavailableReason = humanReason(live.data.reason);
    }
  } else if (live.data && "ok" in live.data && !live.data.ok) {
    unavailableReason = live.data.error;
  }

  const diff = myFp !== null && oppFp !== null ? myFp - oppFp : null;
  const leader: "me" | "opp" | "tie" | null =
    diff === null
      ? null
      : diff > 0
        ? "me"
        : diff < 0
          ? "opp"
          : "tie";

  return (
    <div className="relative rounded-lg border border-l-4 border-l-success/60 bg-card overflow-hidden">
      <div className="p-3 sm:p-3.5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-success">
              Live
            </span>
            <span className="text-muted-foreground/40 text-[10px]">•</span>
            <span className="text-[10px] text-muted-foreground font-medium">
              {lastUpdated ? (
                <span suppressHydrationWarning>
                  Updated {new Date(lastUpdated).toLocaleTimeString()}
                </span>
              ) : live.loading ? (
                "Fetching…"
              ) : (
                "Waiting for my11"
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={live.refresh}
            disabled={!live.canRefresh || live.refreshing}
            className="text-[10px] rounded-md border border-border bg-card px-1.5 py-0.5 hover:bg-muted/40 disabled:opacity-50"
            title={
              live.canRefresh
                ? "Force refresh"
                : `Cooldown ${Math.ceil(live.cooldownLeftMs / 1000)}s`
            }
          >
            {live.refreshing
              ? "…"
              : live.canRefresh
                ? "Refresh"
                : `${Math.ceil(live.cooldownLeftMs / 1000)}s`}
          </button>
        </div>

        {/* Match label */}
        <div className="text-[11px] sm:text-xs text-muted-foreground mb-3 flex items-center gap-1.5 flex-wrap">
          <TeamLogo name={match.teamA} size={14} />
          <span className="truncate">{match.teamA}</span>
          <span className="opacity-60">vs</span>
          <TeamLogo name={match.teamB} size={14} />
          <span className="truncate">{match.teamB}</span>
        </div>

        {/* Scoreboard */}
        <div className="flex items-center gap-3">
          {/* Me */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <UserAvatar
              src={me.avatar}
              name={me.username}
              profileId={me.userId}
              size={36}
              className={
                leader === "me"
                  ? "ring-1 ring-success/40"
                  : "ring-1 ring-primary/30"
              }
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">You</div>
              <div className="text-base sm:text-lg font-bold tabular-nums leading-none">
                {myFp ?? "—"}
              </div>
            </div>
          </div>

          {/* Diff */}
          <div className="flex flex-col items-center shrink-0 px-1">
            <span
              className={
                "text-xl sm:text-2xl font-bold tabular-nums leading-none " +
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
            <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
              gap
            </span>
          </div>

          {/* Opponent */}
          <div className="flex-1 min-w-0 flex items-center gap-2 justify-end text-right">
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">
                {opponent.username}
              </div>
              <div className="text-base sm:text-lg font-bold tabular-nums leading-none">
                {oppFp ?? "—"}
              </div>
            </div>
            <UserAvatar
              src={opponent.avatar}
              name={opponent.username}
              profileId={opponent.userId}
              size={36}
              className={
                leader === "opp"
                  ? "ring-1 ring-destructive/40"
                  : "ring-1 ring-border"
              }
            />
          </div>
        </div>

        {unavailableReason && (
          <p className="mt-2.5 text-[10px] text-muted-foreground">
            {unavailableReason}
          </p>
        )}
      </div>
    </div>
  );
}

function humanReason(reason: string): string {
  switch (reason) {
    case "no_contest":
      return "No contest URL set for this match yet.";
    case "not_started":
      return "Match hasn't started.";
    case "auth_expired":
      return "my11 session expired. Sync your cookie to see live points.";
    case "not_ready":
      return "my11 isn't returning data yet — try again shortly.";
    case "no_civil_war":
      return "No live feed for this match.";
    case "bad_contest_url":
      return "Contest URL looks invalid.";
    default:
      return "Live data unavailable.";
  }
}
