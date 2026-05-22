"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TeamLogo } from "@/components/team-logo";
import { UserAvatar } from "@/components/user-avatar";
import { PlayerAvatar } from "@/components/contest/player-avatar";
import { formatDate } from "@/lib/utils";

// --- API shapes (loose mirror of route returns) ----------------------------

type Player = {
  id: number;
  name: string;
  dName: string;
  sName?: string;
  role?: string;
  roleName?: string;
  roleSubType?: string;
  teamName?: string;
  imgURL?: string;
  points: number;
  credits?: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isWicketKeeper?: boolean;
  isTopPlayer?: boolean;
  selectedBy?: number | null;
  selCapPerc?: number | null;
  selVcPerc?: number | null;
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

type Holder = {
  userId: string;
  username: string;
  handle: string;
  avatar: string | null;
  avatarColor: string | null;
  rank: number | null;
  score: number | null;
  localRank?: number;
};

type LbRow = {
  username: string;
  totalScore: number;
  rank: number | null;
  teamId?: number | null;
};

type CurrentResponse =
  | { ok: true; available: false; reason: string }
  | {
      ok: true;
      available: true;
      refreshMs: number;
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
        contestLinked: boolean;
      };
      myUserId: string;
      myTeam: Team | null;
      myTeamReason: string | null;
      holders: Holder[];
      leaderboard: LbRow[] | null;
      leaderboardError: string | null;
    };

// --- Helpers --------------------------------------------------------------

function roleBucket(p: Player): "WK" | "BAT" | "AR" | "BOWL" {
  const r = `${p.role ?? ""} ${p.roleName ?? ""}`.toUpperCase();
  if (/WK|KEEPER/.test(r)) return "WK";
  if (/AR\b|ALL[ -]?ROUND/.test(r)) return "AR";
  if (/BOWL/.test(r)) return "BOWL";
  return "BAT";
}

function fmtScore(n: number | null | undefined) {
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

// --- Player card ----------------------------------------------------------

function PlayerCard({ player, accent }: { player: Player; accent?: boolean }) {
  const role = roleBucket(player);
  const tag = player.isCaptain ? "C" : player.isViceCaptain ? "VC" : null;
  const tagBg = player.isCaptain
    ? "bg-amber-500 text-amber-50"
    : "bg-sky-500 text-sky-50";
  const ringKind = player.isCaptain ? "captain" : player.isViceCaptain ? "vice" : "default";
  return (
    <div
      className={
        "group relative flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition hover:-translate-y-0.5 hover:shadow-md " +
        (accent
          ? "border-primary/40 bg-gradient-to-b from-primary/10 to-transparent"
          : "border-border/60 bg-background/40 hover:border-border")
      }
    >
      <div className="relative">
        <PlayerAvatar
          src={player.imgURL}
          name={player.dName || player.name}
          size="lg"
          ring={ringKind}
        />
        {tag && (
          <span
            className={
              "absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold shadow ring-2 ring-background " +
              tagBg
            }
          >
            {tag}
          </span>
        )}
      </div>
      <div className="w-full">
        <div className="truncate text-[11px] font-semibold leading-tight">
          {player.dName || player.name}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {player.teamName ?? ""} · {role}
        </div>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-base font-bold tabular-nums">
          {fmtScore(player.points)}
        </span>
        <span className="text-[9px] text-muted-foreground">pts</span>
      </div>
    </div>
  );
}

function PitchSection({
  title,
  players,
}: {
  title: string;
  players: Player[];
}) {
  if (!players.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          ({players.length})
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {players.map((p) => (
          <PlayerCard key={p.id} player={p} accent={p.isCaptain || p.isViceCaptain} />
        ))}
      </div>
    </div>
  );
}

export function TeamPitch({ team }: { team: Team }) {
  const groups = useMemo(() => {
    const buckets: Record<"WK" | "BAT" | "AR" | "BOWL", Player[]> = {
      WK: [],
      BAT: [],
      AR: [],
      BOWL: [],
    };
    for (const p of team.players) buckets[roleBucket(p)].push(p);
    for (const k of Object.keys(buckets) as Array<keyof typeof buckets>) {
      buckets[k].sort((a, b) => b.points - a.points);
    }
    return buckets;
  }, [team.players]);

  const cap = team.players.find((p) => p.isCaptain);
  const vc = team.players.find((p) => p.isViceCaptain);
  const top = team.players.slice().sort((a, b) => b.points - a.points)[0];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="!p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Captain ×2
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <PlayerAvatar src={cap?.imgURL} name={cap?.dName ?? cap?.name ?? ""} size="sm" ring="captain" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{cap?.dName ?? "—"}</div>
              <div className="text-base font-bold tabular-nums">{fmtScore(cap?.points)} pts</div>
            </div>
          </div>
        </Card>
        <Card className="!p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Vice ×1.5
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <PlayerAvatar src={vc?.imgURL} name={vc?.dName ?? vc?.name ?? ""} size="sm" ring="vice" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{vc?.dName ?? "—"}</div>
              <div className="text-base font-bold tabular-nums">{fmtScore(vc?.points)} pts</div>
            </div>
          </div>
        </Card>
        <Card className="!p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Top Scorer
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <PlayerAvatar src={top?.imgURL} name={top?.dName ?? top?.name ?? ""} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{top?.dName ?? "—"}</div>
              <div className="text-base font-bold tabular-nums">{fmtScore(top?.points)} pts</div>
            </div>
          </div>
        </Card>
      </div>
      <PitchSection title="Wicket-keeper" players={groups.WK} />
      <PitchSection title="Batters" players={groups.BAT} />
      <PitchSection title="All-rounders" players={groups.AR} />
      <PitchSection title="Bowlers" players={groups.BOWL} />
    </div>
  );
}

// --- Header ---------------------------------------------------------------

function MatchHeader({
  match,
  myTeam,
  refreshMs,
  lastUpdated,
}: {
  match: Extract<CurrentResponse, { available: true }>["match"];
  myTeam: Team | null;
  refreshMs: number;
  lastUpdated: number | null;
}) {
  const statusBadge =
    match.status === "live"
      ? "bg-success/15 text-success border-success/30"
      : match.status === "completed"
      ? "bg-muted text-muted-foreground border-border"
      : "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return (
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
            <span
              className={
                "ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase " +
                statusBadge
              }
            >
              {match.status === "live" && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              )}
              {match.status}
            </span>
          </div>
          {match.scoreSummary && (
            <div className="mt-2 text-xs text-foreground/80">
              {match.scoreSummary}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {myTeam ? (
            <>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Your team
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                  {rankBadge(myTeam.rank) ?? "—"}
                </span>
                <span className="text-2xl font-extrabold tabular-nums">
                  {fmtScore(myTeam.score)}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                C: {myTeam.captainName ?? "—"} · VC: {myTeam.viceCaptainName ?? "—"}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground">No team mapped yet</div>
          )}
          {match.status === "live" && lastUpdated && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Updated {Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000))}s ago ·
              refresh {Math.round(refreshMs / 1000)}s
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// --- Compare picker -------------------------------------------------------

function ComparePicker({
  matchId,
  meId,
  holders,
}: {
  matchId: string;
  meId: string;
  holders: Holder[];
}) {
  const others = holders.filter((h) => h.userId !== meId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        onClick={() => setOpen((v) => !v)}
        variant="outline"
        className="border-primary/40 bg-gradient-to-br from-primary/15 via-primary/10 to-transparent text-foreground shadow-sm hover:from-primary/25 hover:to-primary/5"
      >
        {open ? "✕ Close" : "🆚 Compare"}
      </Button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-80 max-h-[22rem] overflow-hidden rounded-xl border border-white/10 bg-popover/70 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-popover/60"
        >
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
              Compare with
            </div>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
              {others.length}
            </span>
          </div>
          {others.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No other players have a mapped team yet.
            </p>
          ) : (
            <ul className="max-h-[18rem] divide-y divide-white/5 overflow-auto">
              {others.map((h) => (
                <li key={h.userId}>
                  <Link
                    href={`/contests/${matchId}/compare/${h.userId}`}
                    className="group flex items-center justify-between gap-2 px-3 py-2 transition hover:bg-primary/10"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar src={h.avatar} name={h.username} size={30} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{h.username}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          @{h.handle}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold tabular-nums text-foreground">
                        {fmtScore(h.score)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {rankBadge(h.rank) ?? "—"}
                      </div>
                    </div>
                    <span className="ml-1 text-muted-foreground opacity-0 transition group-hover:opacity-100">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// --- Positions / leaderboard list ----------------------------------------

function PositionsList({
  holders,
  meId,
  activeUserId,
  onSelect,
}: {
  holders: Holder[];
  meId: string;
  activeUserId: string;
  onSelect: (userId: string) => void;
}) {
  if (!holders.length) return null;
  // Sort by current score DESC so positions reflect the latest fetched
  // fantasy points within our friend group, regardless of any stale my11
  // overall rank. `localRank` is precomputed by the service.
  const sorted = [...holders].sort((a, b) => {
    const sa = a.score ?? Number.NEGATIVE_INFINITY;
    const sb = b.score ?? Number.NEGATIVE_INFINITY;
    if (sa !== sb) return sb - sa;
    const ra = a.rank ?? Number.POSITIVE_INFINITY;
    const rb = b.rank ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  });
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold">🏆 Positions</h2>
      <motion.ul layout className="divide-y divide-border/40">
        <AnimatePresence initial={false}>
          {sorted.map((h) => {
            const isMe = h.userId === meId;
            const isActive = h.userId === activeUserId;
            return (
              <motion.li
                key={h.userId}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{
                  layout: { type: "spring", stiffness: 420, damping: 36, mass: 0.7 },
                  opacity: { duration: 0.15 },
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(h.userId)}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md py-2 px-2 -mx-1 text-left transition " +
                    (isActive
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : "hover:bg-muted/40")
                  }
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
                      {rankBadge(h.localRank || h.rank) ?? "—"}
                    </span>
                    <UserAvatar src={h.avatar} name={h.username} size={28} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {h.username}
                        {isMe && (
                          <span className="ml-1 text-[10px] font-medium uppercase text-primary">
                            you
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        @{h.handle}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <motion.div
                      key={h.score ?? "na"}
                      initial={{ scale: 1.15, color: "var(--color-primary, currentColor)" }}
                      animate={{ scale: 1, color: "currentColor" }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="text-sm font-bold tabular-nums"
                    >
                      {fmtScore(h.score)}
                    </motion.div>
                    <div className="text-[10px] text-muted-foreground">pts</div>
                  </div>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>
    </Card>
  );
}

// --- Main view ------------------------------------------------------------

export function ContestsView({ meId, meUsername }: { meId: string; meUsername: string }) {
  const [data, setData] = useState<CurrentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const visibleRef = useRef(true);

  // Which team is being viewed in the pitch view. Defaults to me.
  const [viewUserId, setViewUserId] = useState<string>(meId);
  const [otherTeam, setOtherTeam] = useState<Team | null>(null);
  const [otherLoading, setOtherLoading] = useState(false);
  const [otherError, setOtherError] = useState<string | null>(null);
  const teamSectionRef = useRef<HTMLDivElement | null>(null);

  const selectViewUser = (userId: string) => {
    setViewUserId(userId);
    // Defer one frame so the team card has mounted/transitioned before we
    // scroll — avoids landing above the header on slow paints.
    requestAnimationFrame(() => {
      teamSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const refreshMs =
    data && data.ok && data.available ? data.refreshMs : 30_000;

  const load = async () => {
    try {
      const res = await fetch("/api/contests/current", { cache: "no-store" });
      const json = (await res.json()) as CurrentResponse | { ok: false; error: string };
      if (!("ok" in json) || !json.ok) {
        setError(("error" in json && json.error) || "Failed to load");
      } else {
        setData(json);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const onVis = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data || !data.ok || !data.available) return;
    if (data.match.status === "completed") return;
    const id = window.setInterval(() => {
      if (visibleRef.current) void load();
    }, refreshMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs, data && data.ok && data.available && data.match.status]);

  // Fetch the selected user's team when switching positions list.
  const matchIdForFetch =
    data && data.ok && data.available ? data.match.id : null;
  const matchStatusForFetch =
    data && data.ok && data.available ? data.match.status : null;
  useEffect(() => {
    if (!matchIdForFetch) return;
    if (viewUserId === meId) {
      setOtherTeam(null);
      setOtherError(null);
      return;
    }
    let cancelled = false;
    setOtherLoading(true);
    setOtherError(null);
    void (async () => {
      try {
        const r = await fetch(
          `/api/contests/${matchIdForFetch}/team/${viewUserId}`,
          { cache: "no-store" }
        );
        const j = (await r.json()) as
          | { ok: true; team: Team | null; reason: string | null }
          | { ok: false; error: string };
        if (cancelled) return;
        if (!j.ok) setOtherError(j.error);
        else if (!j.team) setOtherError(j.reason ?? "No team");
        else setOtherTeam(j.team);
      } catch (e) {
        if (!cancelled) setOtherError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setOtherLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewUserId, meId, matchIdForFetch, matchStatusForFetch, refreshMs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-danger/40">
        <div className="text-sm text-danger">{error}</div>
      </Card>
    );
  }

  if (!data || !data.ok) return null;

  if (!data.available) {
    return (
      <Card>
        <div className="space-y-2 text-center py-6">
          <div className="text-2xl">🏏</div>
          <h2 className="text-base font-semibold">No contest linked</h2>
          <p className="text-sm text-muted-foreground">
            The admin hasn&apos;t linked a My11 contest yet. Once a match has a contest URL
            and the admin fetches teams, your team will show up here.
          </p>
        </div>
      </Card>
    );
  }

  const { match, myTeam, myTeamReason, holders } = data;
  const lastUpdated = myTeam?.fetchedAt ?? null;

  const viewingMe = viewUserId === meId;
  const displayedTeam: Team | null = viewingMe ? myTeam : otherTeam;
  const viewedHolder = holders.find((h) => h.userId === viewUserId);
  const viewedUsername = viewingMe ? meUsername : viewedHolder?.username ?? "Player";

  return (
    <div className="space-y-4">
      <MatchHeader
        match={match}
        myTeam={myTeam}
        refreshMs={refreshMs}
        lastUpdated={lastUpdated}
      />

      {!match.contestLinked && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <p className="text-sm">
            ⏳ Match is set, but the admin hasn&apos;t added the My11 contest URL yet.
          </p>
        </Card>
      )}

      {match.contestLinked && !myTeam && myTeamReason === "team_not_mapped" && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <p className="text-sm">
            ⏳ The admin hasn&apos;t fetched your team for this contest yet.
            Once they hit <strong>👥 Fetch My11 Teams</strong>, your team and live points
            will appear here.
          </p>
        </Card>
      )}

      {match.contestLinked && myTeamReason === "auth_expired" && (
        <Card className="border-danger/40 bg-danger/5">
          <p className="text-sm">
            ⚠️ My11 session has expired. Ask the admin to re-sync the cookie.
          </p>
        </Card>
      )}

      {holders.length > 0 && (
        <PositionsList
          holders={holders}
          meId={meId}
          activeUserId={viewUserId}
          onSelect={selectViewUser}
        />
      )}

      {(myTeam || !viewingMe) && (
        <div ref={teamSectionRef} className="scroll-mt-20">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {!viewingMe && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setViewUserId(meId)}
                  >
                    ← My team
                  </Button>
                )}
                <h2 className="text-sm font-semibold truncate">
                  {viewedUsername}&apos;s team
                  {displayedTeam?.userTeamName ? ` · ${displayedTeam.userTeamName}` : ""}
                </h2>
              </div>
              <ComparePicker matchId={match.id} meId={meId} holders={holders} />
            </div>
            {viewingMe ? (
              myTeam ? (
                <TeamPitch team={myTeam} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your team isn&apos;t mapped yet.
                </p>
              )
            ) : otherLoading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner />
              </div>
            ) : otherError ? (
              <p className="text-xs text-danger">{otherError}</p>
            ) : otherTeam ? (
              <TeamPitch team={otherTeam} />
            ) : (
              <p className="text-xs text-muted-foreground">No team available.</p>
            )}
          </Card>
        </div>
      )}

      <PastContests excludeMatchId={match.id} />
    </div>
  );
}

// --- Past contests (completed matches with mapped teams) -----------------

type PastMatch = {
  id: string;
  teamA: string;
  teamB: string;
  teamAShort: string | null;
  teamBShort: string | null;
  startTime: string;
  venue: string | null;
  scoreSummary: string | null;
  matchWinner: string | null;
  myRank: number | null;
  myScore: number | null;
};

function PastContests({ excludeMatchId }: { excludeMatchId?: string }) {
  const [matches, setMatches] = useState<PastMatch[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/contests/past", { cache: "no-store" });
        const j = (await r.json()) as { ok: boolean; matches?: PastMatch[]; error?: string };
        if (j.ok && j.matches) setMatches(j.matches);
        else setErr(j.error ?? "Failed");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return null;
  if (matches === null) return null;
  const list = matches.filter((m) => m.id !== excludeMatchId);
  if (list.length === 0) return null;

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold">📜 Past contests</h2>
      <ul className="divide-y divide-border/40">
        {list.map((m) => (
          <li key={m.id}>
            <Link
              href={`/contests/${m.id}`}
              className="flex items-center justify-between gap-2 rounded-md py-2 px-1 -mx-1 hover:bg-muted/40 transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <TeamLogo name={m.teamA} size={20} />
                <span className="truncate text-sm font-semibold">
                  {m.teamAShort ?? m.teamA}
                </span>
                <span className="text-[10px] text-muted-foreground">vs</span>
                <TeamLogo name={m.teamB} size={20} />
                <span className="truncate text-sm font-semibold">
                  {m.teamBShort ?? m.teamB}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-right">
                <div className="hidden sm:block text-[10px] text-muted-foreground">
                  {formatDate(m.startTime)}
                </div>
                {m.myScore != null ? (
                  <div className="text-right">
                    <div className="text-xs font-bold tabular-nums">{fmtScore(m.myScore)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {rankBadge(m.myRank) ?? "—"}
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground">no team</span>
                )}
                <span className="text-muted-foreground">›</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
