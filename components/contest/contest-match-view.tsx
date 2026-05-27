"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/team-logo";
import { UserAvatar } from "@/components/user-avatar";
import { formatDate } from "@/lib/utils";
import { TeamPitch } from "@/components/contest/contests-view";
import { PlayerLookupPanel } from "@/components/contest/player-lookup-panel";

type Player = {
  id: number;
  name: string;
  dName: string;
  role?: string;
  roleName?: string;
  teamName?: string;
  imgURL?: string;
  points: number;
  credits?: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isWicketKeeper?: boolean;
};

type Team = {
  _id: string;
  matchId: string;
  userId: string;
  my11Username: string;
  userTeamName?: string;
  rank: number | null;
  score: number | null;
  captainName?: string;
  viceCaptainName?: string;
  players: Player[];
  fetchedAt: number;
};

type TeamResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      refreshMs: number;
      playerDirectoryEnabled?: boolean;
      match: {
        id: string;
        teamA: string;
        teamB: string;
        teamAShort: string | null;
        teamBShort: string | null;
        startTime: string;
        status: "upcoming" | "live" | "completed";
        venue: string | null;
        scoreSummary: string | null;
        matchWinner: string | null;
      };
      team: Team | null;
      reason: string | null;
    };

type Holder = {
  userId: string;
  username: string;
  handle: string;
  avatar: string | null;
  rank: number | null;
  score: number | null;
  localRank?: number;
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function rankBadge(rank: number | null | undefined) {
  if (rank == null) return null;
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export function ContestMatchView({
  matchId,
  meId,
  meUsername,
}: {
  matchId: string;
  meId: string;
  meUsername: string;
}) {
  const [data, setData] = useState<TeamResponse | null>(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewUserId, setViewUserId] = useState(meId);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const visibleRef = useRef(true);

  const load = async (uid: string) => {
    try {
      const r = await fetch(`/api/contests/${matchId}/team/${uid}`, {
        cache: "no-store",
      });
      const j = (await r.json()) as TeamResponse;
      setData(j);
      if (!j.ok) setErr(j.error);
      else setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  // load holders once for the picker
  useEffect(() => {
    void (async () => {
      try {
        // reuse current endpoint to get holders quickly via /current is wrong
        // (it's for the live match). Instead derive from leaderboard endpoint
        // returned by team route; but easier: a tiny holders subroute.
        // For now, fetch /api/contests/current — if it points elsewhere, fall
        // back to leaving holders empty.
      } catch {
        /* noop */
      }
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(viewUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewUserId]);

  // Live polling (only when match is live and tab is visible)
  useEffect(() => {
    if (!data || !data.ok) return;
    if (data.match.status !== "live") return;
    const ms = data.refreshMs;
    const onVis = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden) void load(viewUserId);
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => {
      if (visibleRef.current) void load(viewUserId);
    }, ms);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data && data.ok && data.match.status, data && data.ok && data.refreshMs, viewUserId]);

  // Holders list comes from the per-match team endpoint? We don't have it.
  // Lightweight: derive from /api/contests/current only when this match
  // matches it. Otherwise we hit a dedicated holders endpoint we add below.
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch(`/api/contests/${matchId}/holders`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = (await r.json()) as { ok: boolean; holders: Holder[] };
        if (j.ok) setHolders(j.holders);
      } catch {
        /* noop */
      }
    })();
  }, [matchId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (err && !data?.ok) {
    return (
      <Card className="border-danger/40">
        <p className="text-sm text-danger">{err}</p>
      </Card>
    );
  }

  if (!data || !data.ok) return null;

  const { match, team, reason } = data;
  const isMe = viewUserId === meId;
  const viewedHolder = holders.find((h) => h.userId === viewUserId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/contests"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to contests
        </Link>
        {match.status === "live" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            live
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-base font-bold sm:text-lg">
              <TeamLogo name={match.teamA} size={26} />
              <span>{match.teamA}</span>
              <span className="text-muted-foreground text-xs">vs</span>
              <TeamLogo name={match.teamB} size={26} />
              <span>{match.teamB}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{formatDate(match.startTime)}</span>
              {match.venue && <span>· {match.venue}</span>}
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] uppercase">
                {match.status}
              </span>
            </div>
            {match.scoreSummary && (
              <div className="mt-2 text-xs text-foreground/80">{match.scoreSummary}</div>
            )}
            {match.matchWinner && (
              <div className="mt-1 text-[11px] text-success">
                🏆 Winner: {match.matchWinner}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            {team ? (
              <>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {isMe ? "Your team" : `${viewedHolder?.username ?? "Player"}'s team`}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                    {rankBadge(team.rank) ?? "—"}
                  </span>
                  <span className="text-2xl font-extrabold tabular-nums">
                    {fmt(team.score)}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  C: {team.captainName ?? "—"} · VC: {team.viceCaptainName ?? "—"}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                {reason === "team_not_mapped"
                  ? "No team mapped"
                  : "Team unavailable"}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Compare picker */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={isMe ? "default" : "outline"}
          onClick={() => setViewUserId(meId)}
        >
          {meUsername} (you)
        </Button>
        {holders.filter((h) => h.userId !== meId).length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen((v) => !v)}
          >
            {pickerOpen ? "Close compare" : "🆚 Compare with another player"}
          </Button>
        )}
        {!isMe && viewedHolder && (
          <Link
            href={`/contests/${matchId}/compare/${viewUserId}`}
            className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
          >
            Open full comparison →
          </Link>
        )}
      </div>

      {pickerOpen && (
        <Card className="!p-2 max-h-72 overflow-auto">
          {holders.filter((h) => h.userId !== meId).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No other players have a mapped team for this match.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {holders
                .filter((h) => h.userId !== meId)
                .map((h) => (
                  <li key={h.userId}>
                    <Link
                      href={`/contests/${matchId}/compare/${h.userId}`}
                      className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar src={h.avatar} name={h.username} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{h.username}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            @{h.handle}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold tabular-nums">{fmt(h.score)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {rankBadge(h.localRank || h.rank) ?? "—"}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      {team ? (
        <Card>
          <TeamPitch team={team} />
        </Card>
      ) : (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <p className="text-sm">
            {reason === "team_not_mapped"
              ? "No team was captured for this player on this match."
              : reason === "auth_expired"
              ? "My11 cookie expired — admin must refresh."
              : "Team unavailable."}
          </p>
        </Card>
      )}
      <PlayerLookupPanel
        matchId={matchId}
        enabled={
          data && data.ok ? data.playerDirectoryEnabled !== false : true
        }
        refreshMs={
          data && data.ok && data.match.status === "live"
            ? data.refreshMs
            : undefined
        }
      />    </div>
  );
}
