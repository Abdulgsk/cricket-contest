"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/user-avatar";
import { TeamLogo } from "@/components/team-logo";
import { PlayerAvatar } from "@/components/contest/player-avatar";
import { formatDate } from "@/lib/utils";

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
  rank: number | null;
  score: number | null;
  captainName?: string;
  viceCaptainName?: string;
  players: Player[];
  fetchedAt: number;
};

type LbRow = {
  username: string;
  totalScore: number;
  rank: number | null;
};

type TeamResponse =
  | { ok: false; error: string }
  | {
      ok: true;
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
      };
      team: Team | null;
      reason: string | null;
      leaderboard: LbRow[] | null;
      leaderboardError: string | null;
    };

type SeasonRank = { rank: number; total: number } | null;

type Props = {
  matchId: string;
  meId: string;
  meUsername: string;
  meAvatar: string | null;
  otherId: string;
  otherUsername: string;
  otherAvatar: string | null;
  seasonRanks: { me: SeasonRank; other: SeasonRank; seasonSize: number };
};

// --- helpers ---

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function roleBucket(p: Player): "WK" | "BAT" | "AR" | "BOWL" {
  const r = `${p.role ?? ""} ${p.roleName ?? ""}`.toUpperCase();
  if (/WK|KEEPER/.test(r)) return "WK";
  if (/AR\b|ALL[ -]?ROUND/.test(r)) return "AR";
  if (/BOWL/.test(r)) return "BOWL";
  return "BAT";
}

function rankBadge(rank: number | null | undefined) {
  if (rank == null) return "—";
  if (rank === 1) return "🥇 #1";
  if (rank === 2) return "🥈 #2";
  if (rank === 3) return "🥉 #3";
  return `#${rank}`;
}

// --- pieces ---

function PlayerRow({
  player,
  otherHas,
  highlight,
}: {
  player: Player;
  otherHas: boolean;
  highlight?: "me" | "other";
}) {
  const tag = player.isCaptain ? "C" : player.isViceCaptain ? "VC" : null;
  const ringKind = player.isCaptain ? "captain" : player.isViceCaptain ? "vice" : "muted";
  return (
    <div
      className={
        "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition hover:bg-muted/30 " +
        (highlight === "me"
          ? "border-primary/30 bg-primary/5"
          : highlight === "other"
          ? "border-secondary/30 bg-secondary/10"
          : "border-border/50 bg-background/40")
      }
    >
      <PlayerAvatar src={player.imgURL} name={player.dName || player.name} size="sm" ring={ringKind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12px] font-semibold">
            {player.dName || player.name}
          </span>
          {tag && (
            <span
              className={
                "rounded px-1 text-[9px] font-bold " +
                (player.isCaptain
                  ? "bg-amber-500 text-amber-50"
                  : "bg-sky-500 text-sky-50")
              }
            >
              {tag}
            </span>
          )}
          {!otherHas && (
            <span
              className="ml-1 rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground"
              title="Only in this team"
            >
              UNIQUE
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {player.teamName ?? ""} · {roleBucket(player)}
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums">{fmt(player.points)}</span>
    </div>
  );
}

function StatBar({
  label,
  a,
  b,
  aLabel,
  bLabel,
}: {
  label: string;
  a: number;
  b: number;
  aLabel: string;
  bLabel: string;
}) {
  const total = Math.max(1, a + b);
  const ap = Math.round((a / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">
          {fmt(a)} <span className="text-muted-foreground">vs</span> {fmt(b)}
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="bg-primary"
          style={{ width: `${ap}%` }}
          title={`${aLabel}: ${fmt(a)}`}
        />
        <div
          className="flex-1 bg-secondary"
          title={`${bLabel}: ${fmt(b)}`}
        />
      </div>
    </div>
  );
}

// --- main ---

export function CompareView({
  matchId,
  meId,
  meUsername,
  meAvatar,
  otherId,
  otherUsername,
  otherAvatar,
  seasonRanks,
}: Props) {
  const [meTeam, setMeTeam] = useState<Team | null>(null);
  const [otherTeam, setOtherTeam] = useState<Team | null>(null);
  const [matchInfo, setMatchInfo] = useState<
    Extract<TeamResponse, { ok: true }>["match"] | null
  >(null);
  const [lb, setLb] = useState<LbRow[] | null>(null);
  const [refreshMs, setRefreshMs] = useState(30_000);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<{ me?: string; other?: string }>({});
  const visibleRef = useRef(true);

  const load = async () => {
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/contests/${matchId}/team/${meId}`, { cache: "no-store" }).then(
          (r) => r.json() as Promise<TeamResponse>
        ),
        fetch(`/api/contests/${matchId}/team/${otherId}`, { cache: "no-store" }).then(
          (r) => r.json() as Promise<TeamResponse>
        ),
      ]);
      const next: { me?: string; other?: string } = {};
      if (a.ok) {
        setMeTeam(a.team);
        setMatchInfo(a.match);
        setRefreshMs(a.refreshMs);
        if (a.leaderboard) setLb(a.leaderboard);
        if (a.reason) next.me = a.reason;
      } else setErr(a.error);
      if (b.ok) {
        setOtherTeam(b.team);
        if (!matchInfo) setMatchInfo(b.match);
        if (b.leaderboard && !lb) setLb(b.leaderboard);
        if (b.reason) next.other = b.reason;
      } else setErr(b.error);
      setReason(next);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
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
    if (!matchInfo || matchInfo.status === "completed") return;
    const id = window.setInterval(() => {
      if (visibleRef.current) void load();
    }, refreshMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs, matchInfo?.status]);

  const compare = useMemo(() => {
    if (!meTeam || !otherTeam) return null;
    const myIds = new Set(meTeam.players.map((p) => p.id));
    const otherIds = new Set(otherTeam.players.map((p) => p.id));
    const common = meTeam.players.filter((p) => otherIds.has(p.id));
    const onlyMe = meTeam.players.filter((p) => !otherIds.has(p.id));
    const onlyOther = otherTeam.players.filter((p) => !myIds.has(p.id));
    const overlapPct = Math.round((common.length / 11) * 100);

    const roleSplit = (team: Team) => {
      const out = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
      for (const p of team.players) out[roleBucket(p)] += p.points;
      return out;
    };
    const meRoles = roleSplit(meTeam);
    const otherRoles = roleSplit(otherTeam);

    const meCap = meTeam.players.find((p) => p.isCaptain);
    const meVc = meTeam.players.find((p) => p.isViceCaptain);
    const otherCap = otherTeam.players.find((p) => p.isCaptain);
    const otherVc = otherTeam.players.find((p) => p.isViceCaptain);
    // Captaincy contribution = double-counted bonus from the multiplier
    // (already-multiplied points include the bonus). Show side-by-side.
    const meCapPts = (meCap?.points ?? 0) + (meVc?.points ?? 0);
    const otherCapPts = (otherCap?.points ?? 0) + (otherVc?.points ?? 0);

    const allPlayers = [...meTeam.players, ...otherTeam.players];
    const top = allPlayers.slice().sort((a, b) => b.points - a.points)[0];
    const meHasTop = !!meTeam.players.find((p) => p.id === top?.id);
    const otherHasTop = !!otherTeam.players.find((p) => p.id === top?.id);

    const avg = (team: Team) =>
      team.players.length
        ? team.players.reduce((s, p) => s + (p.credits ?? 0), 0) / team.players.length
        : 0;

    return {
      common,
      onlyMe,
      onlyOther,
      overlapPct,
      meRoles,
      otherRoles,
      meCap,
      meVc,
      otherCap,
      otherVc,
      meCapPts,
      otherCapPts,
      top,
      meHasTop,
      otherHasTop,
      meAvgCredits: avg(meTeam),
      otherAvgCredits: avg(otherTeam),
    };
  }, [meTeam, otherTeam]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (err) {
    return (
      <Card className="border-danger/40">
        <p className="text-sm text-danger">{err}</p>
      </Card>
    );
  }

  // Find both users in the my11 contest leaderboard for cross-context info.
  const meLb = lb?.find(
    (r) => r.username.toLowerCase() === (meTeam?.my11Username ?? "").toLowerCase()
  );
  const otherLb = lb?.find(
    (r) => r.username.toLowerCase() === (otherTeam?.my11Username ?? "").toLowerCase()
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/contests"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to contest
        </Link>
        {matchInfo?.status === "live" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            live · {Math.round(refreshMs / 1000)}s
          </span>
        )}
      </div>

      {/* HERO HEAD-TO-HEAD */}
      <Card className="overflow-hidden">
        {matchInfo && (
          <div className="mb-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <TeamLogo name={matchInfo.teamA} size={18} />
            <span>{matchInfo.teamA}</span>
            <span>vs</span>
            <TeamLogo name={matchInfo.teamB} size={18} />
            <span>{matchInfo.teamB}</span>
            <span className="opacity-60">· {formatDate(matchInfo.startTime)}</span>
          </div>
        )}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Me */}
          <div className="flex flex-col items-center text-center">
            <UserAvatar src={meAvatar} name={meUsername} size={56} />
            <div className="mt-2 truncate max-w-full text-sm font-bold">{meUsername}</div>
            <div className="text-3xl font-extrabold tabular-nums text-primary">
              {fmt(meTeam?.score)}
            </div>
            <div className="mt-1 flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
              <span>Contest: {rankBadge(meTeam?.rank)}</span>
              {seasonRanks.me && (
                <span>
                  Season: #{seasonRanks.me.rank} · {fmt(seasonRanks.me.total)} pts
                </span>
              )}
            </div>
          </div>
          <div className="text-2xl font-black text-muted-foreground">VS</div>
          {/* Other */}
          <div className="flex flex-col items-center text-center">
            <UserAvatar src={otherAvatar} name={otherUsername} size={56} />
            <div className="mt-2 truncate max-w-full text-sm font-bold">{otherUsername}</div>
            <div className="text-3xl font-extrabold tabular-nums text-secondary-foreground">
              {fmt(otherTeam?.score)}
            </div>
            <div className="mt-1 flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
              <span>Contest: {rankBadge(otherTeam?.rank)}</span>
              {seasonRanks.other && (
                <span>
                  Season: #{seasonRanks.other.rank} · {fmt(seasonRanks.other.total)} pts
                </span>
              )}
            </div>
          </div>
        </div>

        {meTeam && otherTeam && compare && (
          <>
            {/* Lead bar */}
            <div className="mt-5">
              <StatBar
                label="Total points"
                a={meTeam.score ?? 0}
                b={otherTeam.score ?? 0}
                aLabel={meUsername}
                bLabel={otherUsername}
              />
            </div>

            {/* Lineup overlap */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
              <Card className="!p-2">
                <div className="text-muted-foreground">Common players</div>
                <div className="text-lg font-bold">{compare.common.length}/11</div>
                <div className="text-[10px] text-muted-foreground">{compare.overlapPct}% overlap</div>
              </Card>
              <Card className="!p-2">
                <div className="text-muted-foreground">Captaincy haul</div>
                <div className="text-sm font-bold tabular-nums">
                  {fmt(compare.meCapPts)} <span className="text-muted-foreground">vs</span>{" "}
                  {fmt(compare.otherCapPts)}
                </div>
                <div className="text-[10px] text-muted-foreground">C + VC combined</div>
              </Card>
              <Card className="!p-2">
                <div className="text-muted-foreground">Avg credits</div>
                <div className="text-sm font-bold tabular-nums">
                  {compare.meAvgCredits.toFixed(1)} <span className="text-muted-foreground">vs</span>{" "}
                  {compare.otherAvgCredits.toFixed(1)}
                </div>
                <div className="text-[10px] text-muted-foreground">Per player</div>
              </Card>
            </div>
          </>
        )}
      </Card>

      {/* Captaincy duel */}
      {meTeam && otherTeam && compare && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">⭐ Captaincy duel</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {meUsername}
              </div>
              <CapRow tag="C ×2" player={compare.meCap} />
              <CapRow tag="VC ×1.5" player={compare.meVc} />
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {otherUsername}
              </div>
              <CapRow tag="C ×2" player={compare.otherCap} />
              <CapRow tag="VC ×1.5" player={compare.otherVc} />
            </div>
          </div>
          {compare.top && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <div className="font-semibold">
                🏆 Top scorer: {compare.top.dName} · {fmt(compare.top.points)} pts
              </div>
              <div className="mt-1 text-muted-foreground">
                {meUsername}: {compare.meHasTop ? "✅ picked" : "❌ missed"} ·{" "}
                {otherUsername}: {compare.otherHasTop ? "✅ picked" : "❌ missed"}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Role split */}
      {compare && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">📊 Points by role</h3>
          <div className="space-y-3">
            {(["WK", "BAT", "AR", "BOWL"] as const).map((role) => (
              <StatBar
                key={role}
                label={
                  role === "WK"
                    ? "Wicket-keeper"
                    : role === "BAT"
                    ? "Batters"
                    : role === "AR"
                    ? "All-rounders"
                    : "Bowlers"
                }
                a={compare.meRoles[role]}
                b={compare.otherRoles[role]}
                aLabel={meUsername}
                bLabel={otherUsername}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Player breakdown columns */}
      {meTeam && otherTeam && compare && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">🆚 Player-by-player</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PlayerColumn
              title={`${meUsername} only`}
              players={compare.onlyMe}
              accent="me"
              empty="Picked the same XI"
            />
            <PlayerColumn
              title={`${otherUsername} only`}
              players={compare.onlyOther}
              accent="other"
              empty="Picked the same XI"
            />
          </div>
          {compare.common.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                Common players ({compare.common.length})
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {compare.common.map((p) => {
                  const otherP = otherTeam.players.find((x) => x.id === p.id);
                  const meTag = p.isCaptain ? "C" : p.isViceCaptain ? "VC" : null;
                  const otherTag = otherP?.isCaptain
                    ? "C"
                    : otherP?.isViceCaptain
                    ? "VC"
                    : null;
                  const samePts = otherP && otherP.points === p.points;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 px-2 py-1.5 transition hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar
                          src={p.imgURL}
                          name={p.dName || p.name}
                          size="sm"
                          ring="muted"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold">{p.dName}</div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {p.teamName ?? ""} · {roleBucket(p)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-xs tabular-nums">
                        <SideChip
                          tag={meTag}
                          points={p.points}
                          tone="me"
                        />
                        {!samePts || otherTag !== meTag ? (
                          <>
                            <span className="text-muted-foreground/50">/</span>
                            <SideChip
                              tag={otherTag}
                              points={otherP?.points}
                              tone="other"
                            />
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* My11 contest leaderboard tail */}
      {lb && lb.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">🏟️ My11 contest leaderboard</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">User</th>
                  <th className="px-2 py-1.5 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {lb
                  .slice()
                  .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
                  .map((row) => {
                    const isMe = row === meLb;
                    const isOther = row === otherLb;
                    return (
                      <tr
                        key={row.username + row.rank}
                        className={
                          "border-b border-border/30 " +
                          (isMe
                            ? "bg-primary/10"
                            : isOther
                            ? "bg-secondary/10"
                            : "")
                        }
                      >
                        <td className="px-2 py-1.5 font-semibold">{rankBadge(row.rank)}</td>
                        <td className="px-2 py-1.5">{row.username}</td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                          {fmt(row.totalScore)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(reason.me || reason.other) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <p className="text-xs text-muted-foreground">
            {reason.me === "team_not_mapped" && `Your team isn't mapped yet. `}
            {reason.other === "team_not_mapped" && `${otherUsername}'s team isn't mapped yet. `}
            {(reason.me === "auth_expired" || reason.other === "auth_expired") &&
              `My11 cookie has expired — admin needs to refresh it.`}
          </p>
        </Card>
      )}
    </div>
  );
}

function CapRow({ tag, player }: { tag: string; player?: Player }) {
  const isCap = tag.startsWith("C") && !tag.startsWith("VC");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 p-2">
      <span
        className={
          "rounded px-1 text-[9px] font-bold " +
          (isCap ? "bg-amber-500 text-amber-50" : "bg-sky-500 text-sky-50")
        }
      >
        {tag}
      </span>
      <PlayerAvatar
        src={player?.imgURL}
        name={player?.dName ?? player?.name ?? ""}
        size="sm"
        ring={isCap ? "captain" : "vice"}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold">{player?.dName ?? "—"}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {player?.teamName ?? ""} · {player ? roleBucket(player) : ""}
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums">{fmt(player?.points)}</span>
    </div>
  );
}

function SideChip({
  tag,
  points,
  tone,
}: {
  tag: "C" | "VC" | null;
  points: number | null | undefined;
  tone: "me" | "other";
}) {
  // Our picks keep the brand colors (amber for C, sky for VC).
  // Opponent's picks are flagged red so they pop as a "threat".
  const tagBg = !tag
    ? ""
    : tone === "other"
    ? "bg-red-500 text-red-50"
    : tag === "C"
    ? "bg-amber-500 text-amber-50"
    : "bg-sky-500 text-sky-50";
  const ptsClass = tag
    ? tone === "me"
      ? "text-primary font-bold"
      : "text-secondary-foreground font-bold"
    : "font-semibold";
  return (
    <span className="inline-flex items-center gap-1">
      {tag && (
        <span className={"rounded px-1 text-[9px] font-bold " + tagBg}>{tag}</span>
      )}
      <span className={"tabular-nums " + ptsClass}>{fmt(points)}</span>
    </span>
  );
}

function PlayerColumn({
  title,
  players,
  accent,
  empty,
}: {
  title: string;
  players: Player[];
  accent: "me" | "other";
  empty: string;
}) {
  const total = players.reduce((s, p) => s + p.points, 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
        <span className="text-xs font-bold tabular-nums">
          {fmt(total)} <span className="text-muted-foreground font-normal">pts</span>
        </span>
      </div>
      {players.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {players
            .slice()
            .sort((a, b) => b.points - a.points)
            .map((p) => (
              <PlayerRow key={p.id} player={p} otherHas={false} highlight={accent} />
            ))}
        </div>
      )}
    </div>
  );
}
