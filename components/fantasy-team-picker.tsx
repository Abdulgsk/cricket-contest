"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/team-logo";
import {
  saveFantasyTeamAction,
  loadFantasyCaptainStatsAction,
} from "@/actions/fantasy-team";
import {
  FANTASY_ROLES,
  FANTASY_TEAM_RULES,
  type FantasyRole,
} from "@/lib/constants";

type RosterPlayer = {
  name: string;
  fantasyRole: FantasyRole;
  role?: string;
  teamShort?: string;
  imgUrl?: string;
  profileId?: string;
  playingStatus?: "playing" | "bench" | "";
  playingXIChange?: "IN" | "";
};

type Props = {
  match: {
    id: string;
    teamA: string;
    teamB: string;
    teamAShort: string;
    teamBShort: string;
    startTime: string;
  };
  players: RosterPlayer[];
  locked: boolean;
  xiAnnounced?: boolean;
  rosterNotice?: string | null;
  initialTeam: {
    players: { name: string; isCaptain: boolean; isViceCaptain: boolean }[];
    subs?: string[];
  } | null;
};

const ROLE_LABEL: Record<FantasyRole, string> = {
  WK: "Wicket-keepers",
  BAT: "Batters",
  AR: "All-rounders",
  BOWL: "Bowlers",
};
const ROLE_SHORT: Record<FantasyRole, string> = {
  WK: "WK",
  BAT: "BAT",
  AR: "AR",
  BOWL: "BOWL",
};

type PlayStatus = "playing" | "impact" | "bench" | "unknown";

/** Post-toss status of a roster player for grouping & badges. */
function playStatusOf(p: RosterPlayer): PlayStatus {
  if (p.playingXIChange === "IN") return "impact";
  if (p.playingStatus === "playing") return "playing";
  if (p.playingStatus === "bench") return "bench";
  return "unknown";
}

const STATUS_RANK: Record<PlayStatus, number> = { playing: 0, impact: 1, bench: 2, unknown: 0 };

function StatusBadge({ status }: { status: PlayStatus }) {
  if (status === "playing")
    return <Badge tone="success">In XI</Badge>;
  if (status === "impact")
    return <Badge tone="accent">Impact</Badge>;
  if (status === "bench")
    return <Badge tone="warning">Bench</Badge>;
  return null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function PlayerFace({ player, size = 40 }: { player?: RosterPlayer; size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-border"
      style={{ height: size, width: size }}
    >
      {player?.imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={player.imgUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
      {!player?.imgUrl && <span>{player ? initials(player.name) : "?"}</span>}
    </span>
  );
}

function MatchHeader({ match, locked }: { match: Props["match"]; locked: boolean }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3 font-bold">
          <span className="inline-flex items-center gap-1.5">
            <TeamLogo name={match.teamA} size={26} />
            <span className="truncate">{match.teamAShort}</span>
          </span>
          <span className="text-xs font-medium text-muted-foreground">vs</span>
          <span className="inline-flex items-center gap-1.5">
            <TeamLogo name={match.teamB} size={26} />
            <span className="truncate">{match.teamBShort}</span>
          </span>
        </div>
        <Badge tone={locked ? "danger" : "warning"}>{locked ? "Locked" : "Open"}</Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
        Starts {new Date(match.startTime).toLocaleString()}
      </div>
    </Card>
  );
}

export function FantasyTeamPicker({ match, players, locked, xiAnnounced, rosterNotice, initialTeam }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [selected, setSelected] = useState<string[]>(
    initialTeam?.players.map((p) => p.name) ?? []
  );
  const [captain, setCaptain] = useState<string | null>(
    initialTeam?.players.find((p) => p.isCaptain)?.name ?? null
  );
  const [viceCaptain, setViceCaptain] = useState<string | null>(
    initialTeam?.players.find((p) => p.isViceCaptain)?.name ?? null
  );
  const [subs, setSubs] = useState<string[]>(initialTeam?.subs ?? []);
  const [tab, setTab] = useState<FantasyRole>("WK");
  // Three-step flow: pick the XI, choose captain & vice-captain, add backups.
  const [step, setStep] = useState<"team" | "captain" | "subs">("team");
  const [capStats, setCapStats] = useState<
    Record<string, { captainPct: number; viceCaptainPct: number }>
  >({});
  const [statsTeams, setStatsTeams] = useState(0);
  const [statsLoading, setStatsLoading] = useState(false);

  const byName = useMemo(() => new Map(players.map((p) => [p.name, p])), [players]);

  const counts = useMemo(() => {
    const c: Record<FantasyRole, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
    for (const n of selected) {
      const p = byName.get(n);
      if (p) c[p.fantasyRole]++;
    }
    return c;
  }, [selected, byName]);

  const perTeam = useMemo(() => {
    const t: Record<string, number> = {};
    for (const n of selected) {
      const p = byName.get(n);
      if (p?.teamShort) t[p.teamShort] = (t[p.teamShort] ?? 0) + 1;
    }
    return t;
  }, [selected, byName]);

  const TEAM_SIZE = FANTASY_TEAM_RULES.TEAM_SIZE;
  const teamACount = perTeam[match.teamAShort] ?? 0;
  const teamBCount = perTeam[match.teamBShort] ?? 0;

  // Composition-only validity (ignores captain/VC) — gates the "Next" button.
  const teamError = useMemo(() => {
    if (selected.length !== TEAM_SIZE)
      return `Pick ${TEAM_SIZE} players (${selected.length}/${TEAM_SIZE})`;
    for (const r of FANTASY_ROLES) {
      if (counts[r] < FANTASY_TEAM_RULES.MIN[r])
        return `Need at least ${FANTASY_TEAM_RULES.MIN[r]} ${ROLE_SHORT[r]}`;
      if (counts[r] > FANTASY_TEAM_RULES.MAX[r])
        return `At most ${FANTASY_TEAM_RULES.MAX[r]} ${ROLE_SHORT[r]}`;
    }
    for (const [team, n] of Object.entries(perTeam)) {
      if (n > FANTASY_TEAM_RULES.MAX_PER_TEAM)
        return `At most ${FANTASY_TEAM_RULES.MAX_PER_TEAM} from ${team}`;
    }
    return null;
  }, [selected, counts, perTeam, TEAM_SIZE]);

  const validationError = useMemo(() => {
    if (teamError) return teamError;
    if (!captain) return "Pick a captain (2×)";
    if (!viceCaptain) return "Pick a vice-captain (1.5×)";
    return null;
  }, [teamError, captain, viceCaptain]);

  function goToCaptain() {
    if (teamError) {
      toast.error(teamError);
      return;
    }
    setStep("captain");
    // Load live C/VC selection percentages for the match.
    setStatsLoading(true);
    loadFantasyCaptainStatsAction(match.id)
      .then((r) => {
        if (r.ok) {
          setCapStats(r.stats);
          setStatsTeams(r.totalTeams);
        }
      })
      .finally(() => setStatsLoading(false));
  }


  function toggle(name: string) {
    if (locked) return;
    const p = byName.get(name);
    setSelected((prev) => {
      if (prev.includes(name)) {
        if (captain === name) setCaptain(null);
        if (viceCaptain === name) setViceCaptain(null);
        return prev.filter((n) => n !== name);
      }
      if (prev.length >= TEAM_SIZE) {
        toast.error(`You can only pick ${TEAM_SIZE} players`);
        return prev;
      }
      if (p && counts[p.fantasyRole] >= FANTASY_TEAM_RULES.MAX[p.fantasyRole]) {
        toast.error(`Max ${FANTASY_TEAM_RULES.MAX[p.fantasyRole]} ${ROLE_SHORT[p.fantasyRole]} allowed`);
        return prev;
      }
      if (p?.teamShort && (perTeam[p.teamShort] ?? 0) >= FANTASY_TEAM_RULES.MAX_PER_TEAM) {
        toast.error(`Max ${FANTASY_TEAM_RULES.MAX_PER_TEAM} players from ${p.teamShort}`);
        return prev;
      }
      return [...prev, name];
    });
  }

  function setRole(name: string, role: "C" | "VC") {
    if (role === "C") {
      setCaptain(name);
      if (viceCaptain === name) setViceCaptain(null);
    } else {
      setViceCaptain(name);
      if (captain === name) setCaptain(null);
    }
  }

  function toggleSub(name: string) {
    setSubs((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= FANTASY_TEAM_RULES.MAX_SUBS) {
        toast.error(`You can pick at most ${FANTASY_TEAM_RULES.MAX_SUBS} backups`);
        return prev;
      }
      return [...prev, name];
    });
  }

  function save() {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    start(async () => {
      const r = await saveFantasyTeamAction({
        matchId: match.id,
        players: selected,
        captain: captain!,
        viceCaptain: viceCaptain!,
        subs,
      });
      if (r.ok) {
        toast.success("Team saved!");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  // Players for the active role tab. Post-toss: Playing XI first, then Impact,
  // then Bench; within each group team A before team B, then name.
  const tabPlayers = useMemo(() => {
    const order = (t?: string) =>
      t === match.teamAShort ? 0 : t === match.teamBShort ? 1 : 2;
    return players
      .filter((p) => p.fantasyRole === tab)
      .sort(
        (a, b) =>
          STATUS_RANK[playStatusOf(a)] - STATUS_RANK[playStatusOf(b)] ||
          order(a.teamShort) - order(b.teamShort) ||
          a.name.localeCompare(b.name)
      );
  }, [players, tab, match.teamAShort, match.teamBShort]);

  // Backup pool = roster players NOT in the starting XI, grouped by status.
  const backupPool = useMemo(() => {
    const order = (t?: string) =>
      t === match.teamAShort ? 0 : t === match.teamBShort ? 1 : 2;
    const roleIdx = (r: FantasyRole) => FANTASY_ROLES.indexOf(r);
    return players
      .filter((p) => !selected.includes(p.name))
      .sort(
        (a, b) =>
          STATUS_RANK[playStatusOf(a)] - STATUS_RANK[playStatusOf(b)] ||
          roleIdx(a.fantasyRole) - roleIdx(b.fantasyRole) ||
          order(a.teamShort) - order(b.teamShort) ||
          a.name.localeCompare(b.name)
      );
  }, [players, selected, match.teamAShort, match.teamBShort]);

  // The selected XI, ordered by role then name — used for the captain step.
  const selectedXI = useMemo(() => {
    const roleIdx = (r: FantasyRole) => FANTASY_ROLES.indexOf(r);
    return selected
      .map((n) => byName.get(n))
      .filter((p): p is RosterPlayer => !!p)
      .sort(
        (a, b) =>
          roleIdx(a.fantasyRole) - roleIdx(b.fantasyRole) || a.name.localeCompare(b.name)
      );
  }, [selected, byName]);

  // ---- Locked, no team ----
  if (locked && !initialTeam) {
    return (
      <div className="space-y-4">
        <MatchHeader match={match} locked />
        <Card className="border-warning/40">
          <p className="text-sm font-medium text-warning">Selection locked</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The match has started and you didn&apos;t pick a team for it.
          </p>
        </Card>
      </div>
    );
  }

  // ---- Locked, with team: premium read-only ----
  if (locked && initialTeam) {
    const benchCount = selectedXI.filter((p) => playStatusOf(p) === "bench").length;
    const impactCount = selectedXI.filter((p) => playStatusOf(p) === "impact").length;
    return (
      <div className="space-y-4">
        <MatchHeader match={match} locked />
        {xiAnnounced && (benchCount > 0 || impactCount > 0) && (
          <Card className="!p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">In your XI:</span>
              {benchCount > 0 && <Badge tone="warning">{benchCount} on bench</Badge>}
              {impactCount > 0 && <Badge tone="accent">{impactCount} impact</Badge>}
              {subs.length > 0 && (
                <span className="text-muted-foreground">
                  · backups auto-cover any &quot;Not Playing&quot; picks
                </span>
              )}
            </div>
          </Card>
        )}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Your locked XI</h2>
            <Badge tone="danger">Locked</Badge>
          </div>
          <div className="space-y-1.5">
            {selectedXI.map((info) => (
              <div
                key={info.name}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <PlayerFace player={info} size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{info.name}</span>
                      {xiAnnounced && <StatusBadge status={playStatusOf(info)} />}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{ROLE_SHORT[info.fantasyRole]}</span>
                      {info.teamShort && (
                        <>
                          <span>·</span>
                          <span>{info.teamShort}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {captain === info.name && <Badge tone="accent">C · 2×</Badge>}
                {viceCaptain === info.name && <Badge tone="warning">VC · 1.5×</Badge>}
              </div>
            ))}
          </div>
          {subs.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">
                Backups
              </div>
              <div className="space-y-1.5">
                {subs.map((name, i) => {
                  const p = byName.get(name);
                  if (!p) return null;
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/10 px-3 py-2"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-primary-foreground">
                        B{i + 1}
                      </span>
                      <PlayerFace player={p} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{p.name}</span>
                          {xiAnnounced && <StatusBadge status={playStatusOf(p)} />}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {ROLE_SHORT[p.fantasyRole]}
                          {p.teamShort ? ` · ${p.teamShort}` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ---- No roster yet ----
  if (!players.length) {
    return (
      <div className="space-y-4">
        <MatchHeader match={match} locked={false} />
        <Card className="border-warning/40">
          <p className="text-sm font-medium text-warning">Squad not available yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rosterNotice ??
              "The playing squads for this match haven't been published yet."}{" "}
            Cricbuzz usually posts them 1–2 days before the game. Check back closer
            to start time to pick your XI.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => router.refresh()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  // ---- Open picker ----
  return (
    <div className="space-y-3 pb-32">
      <MatchHeader match={match} locked={false} />

      {step === "team" ? (
       <>
      {/* Progress dashboard */}
      <Card className="space-y-3 !p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            {selected.length}
            <span className="text-muted-foreground">/{TEAM_SIZE} players</span>
          </span>
          <div className="flex items-center gap-2 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <TeamLogo name={match.teamA} size={14} />
              {teamACount}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <TeamLogo name={match.teamB} size={14} />
              {teamBCount}
            </span>
            <span className="text-muted-foreground">max {FANTASY_TEAM_RULES.MAX_PER_TEAM}/team</span>
          </div>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: TEAM_SIZE }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < selected.length ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </Card>

      {/* Role tabs */}
      <div className="sticky top-0 z-10 -mx-1 grid grid-cols-4 gap-1.5 rounded-2xl bg-background/80 px-1 py-1 backdrop-blur">
        {FANTASY_ROLES.map((r) => {
          const n = counts[r];
          const below = n < FANTASY_TEAM_RULES.MIN[r];
          const over = n > FANTASY_TEAM_RULES.MAX[r];
          const active = tab === r;
          return (
            <button
              key={r}
              onClick={() => setTab(r)}
              className={`flex flex-col items-center rounded-xl border px-1 py-1.5 transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : over || below
                  ? "border-danger/40 bg-danger/5"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <span className="text-xs font-bold tracking-wide">{ROLE_SHORT[r]}</span>
              <span
                className={`text-[10px] ${
                  active ? "text-primary-foreground/80" : "text-muted-foreground"
                }`}
              >
                {n} · {FANTASY_TEAM_RULES.MIN[r]}-{FANTASY_TEAM_RULES.MAX[r]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active role hint */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-semibold">{ROLE_LABEL[tab]}</span>
        <span className="text-muted-foreground">
          Pick {FANTASY_TEAM_RULES.MIN[tab]}-{FANTASY_TEAM_RULES.MAX[tab]} · selected {counts[tab]}
        </span>
      </div>

      {/* Player list for active role */}
      <div className="space-y-1.5">
        {tabPlayers.map((p) => {
          const isSel = selected.includes(p.name);
          return (
            <button
              key={p.name}
              onClick={() => toggle(p.name)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                isSel
                  ? "border-primary/60 bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <PlayerFace player={p} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  {xiAnnounced && <StatusBadge status={playStatusOf(p)} />}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {p.teamShort && (
                    <span className="inline-flex items-center gap-1">
                      <TeamLogo name={p.teamShort} size={12} />
                      {p.teamShort}
                    </span>
                  )}
                  <span>·</span>
                  <span>{ROLE_SHORT[p.fantasyRole]}</span>
                </div>
              </div>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-base font-bold transition ${
                  isSel
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {isSel ? "✓" : "+"}
              </span>
            </button>
          );
        })}
        {!tabPlayers.length && (
          <Card>
            <p className="text-sm text-muted-foreground">
              No {ROLE_LABEL[tab].toLowerCase()} in the announced squads.
            </p>
          </Card>
        )}
      </div>

      </>
      ) : step === "captain" ? (
       <>
      {/* Captain & vice-captain step */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Captain &amp; Vice-captain</h2>
          <Badge tone="accent">{statsLoading ? "Loading…" : `${statsTeams} teams`}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Your captain scores <strong>2×</strong> and your vice-captain{" "}
          <strong>1.5×</strong>. The bars show how often each player was picked as
          C / VC across all teams in this match.
        </p>
        <div className="space-y-1.5">
          {selectedXI.map((info) => {
            const s = capStats[info.name];
            const cPct = s?.captainPct ?? 0;
            const vcPct = s?.viceCaptainPct ?? 0;
            const isC = captain === info.name;
            const isVC = viceCaptain === info.name;
            return (
              <div
                key={info.name}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <PlayerFace player={info} size={36} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{info.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {ROLE_SHORT[info.fantasyRole]}
                      {info.teamShort ? ` · ${info.teamShort}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-stretch gap-1.5">
                  <button
                    onClick={() => setRole(info.name, "C")}
                    className={`flex w-14 flex-col items-center justify-center rounded-lg px-1 py-1 transition ${
                      isC
                        ? "bg-accent text-primary-foreground shadow-sm"
                        : "border border-border hover:bg-muted"
                    }`}
                    title="Captain (2×)"
                  >
                    <span className="text-xs font-bold">C</span>
                    <span
                      className={`text-[10px] ${
                        isC ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {cPct}%
                    </span>
                  </button>
                  <button
                    onClick={() => setRole(info.name, "VC")}
                    className={`flex w-14 flex-col items-center justify-center rounded-lg px-1 py-1 transition ${
                      isVC
                        ? "bg-warning text-primary-foreground shadow-sm"
                        : "border border-border hover:bg-muted"
                    }`}
                    title="Vice-captain (1.5×)"
                  >
                    <span className="text-xs font-bold">VC</span>
                    <span
                      className={`text-[10px] ${
                        isVC ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {vcPct}%
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      </>
      ) : (
       <>
      {/* Backups step (B1..B4) */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Backups</h2>
          <Badge tone="accent">{subs.length}/{FANTASY_TEAM_RULES.MAX_SUBS}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick up to <strong>{FANTASY_TEAM_RULES.MAX_SUBS}</strong> backups in
          priority order. If a player in your XI is <strong>Not Playing</strong>,
          your highest-priority available backup automatically replaces them and
          scores their points — including if they were your C/VC.
        </p>

        {/* Chosen backups, ordered B1..B4 */}
        {subs.length > 0 && (
          <div className="space-y-1.5">
            {subs.map((name, i) => {
              const p = byName.get(name);
              if (!p) return null;
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary-foreground">
                      B{i + 1}
                    </span>
                    <PlayerFace player={p} size={32} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{p.name}</span>
                        {xiAnnounced && <StatusBadge status={playStatusOf(p)} />}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {ROLE_SHORT[p.fantasyRole]}
                        {p.teamShort ? ` · ${p.teamShort}` : ""}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleSub(name)}
                    className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Available pool (players outside the XI) */}
        <div className="space-y-1.5">
          <div className="px-1 text-xs font-semibold text-muted-foreground">
            Available players
          </div>
          {backupPool.map((p) => {
            const order = subs.indexOf(p.name);
            const isSel = order >= 0;
            return (
              <button
                key={p.name}
                onClick={() => toggleSub(p.name)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  isSel
                    ? "border-accent/60 bg-accent/10"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <PlayerFace player={p} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    {xiAnnounced && <StatusBadge status={playStatusOf(p)} />}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {p.teamShort && (
                      <span className="inline-flex items-center gap-1">
                        <TeamLogo name={p.teamShort} size={12} />
                        {p.teamShort}
                      </span>
                    )}
                    <span>·</span>
                    <span>{ROLE_SHORT[p.fantasyRole]}</span>
                  </div>
                </div>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition ${
                    isSel
                      ? "border-accent bg-accent text-primary-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {isSel ? `B${order + 1}` : "+"}
                </span>
              </button>
            );
          })}
          {!backupPool.length && (
            <Card>
              <p className="text-sm text-muted-foreground">
                No other players available as backups.
              </p>
            </Card>
          )}
        </div>
      </Card>
      </>
      )}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          {step === "team" ? (
            <>
              <div className="min-w-0 text-xs">
                {teamError ? (
                  <span className="text-warning">{teamError}</span>
                ) : (
                  <span className="font-medium text-success">XI complete ✓</span>
                )}
              </div>
              <Button
                onClick={goToCaptain}
                disabled={!!teamError}
                className="shrink-0"
              >
                Next: Captain →
              </Button>
            </>
          ) : step === "captain" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("team")}
                disabled={pending}
                className="shrink-0"
              >
                ← Back
              </Button>
              <div className="min-w-0 flex-1 text-right text-xs">
                {!captain || !viceCaptain ? (
                  <span className="text-warning">Pick a captain &amp; vice-captain</span>
                ) : (
                  <span className="font-medium text-success">C &amp; VC set ✓</span>
                )}
              </div>
              <Button
                onClick={() => setStep("subs")}
                disabled={!captain || !viceCaptain}
                className="shrink-0"
              >
                Next: Backups →
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("captain")}
                disabled={pending}
                className="shrink-0"
              >
                ← Back
              </Button>
              <div className="min-w-0 flex-1 text-right text-xs">
                {validationError ? (
                  <span className="text-warning">{validationError}</span>
                ) : (
                  <span className="font-medium text-success">Ready to save ✓</span>
                )}
              </div>
              <Button
                onClick={save}
                loading={pending}
                disabled={!!validationError || pending}
                className="shrink-0"
              >
                {initialTeam ? "Update team" : "Save team"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
