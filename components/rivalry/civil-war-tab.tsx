"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameCivilWarTeamAction } from "@/actions/civil-war";
import type { CivilWarMatchView } from "@/actions/civil-war";
import { CivilWarLivePanel } from "@/components/rivalry/civil-war-live-panel";
import { useLiveCivilWar } from "@/components/rivalry/use-live-civil-war";

const OUTCOME_LABEL: Record<string, string> = {
  A_decisive: "Decisive win",
  B_decisive: "Decisive win",
  A_split: "Split win (more 1v1 wins)",
  B_split: "Split win (more 1v1 wins)",
  A_fp_tiebreak: "FP tiebreak win",
  B_fp_tiebreak: "FP tiebreak win",
  draw: "Draw — no points",
  not_eligible: "Cancelled — not enough rivalries",
};

const REVEAL_KEY = (matchId: string) => `civilwar:revealed:${matchId}`;

export function CivilWarTab({ matches }: { matches: CivilWarMatchView[] }) {
  return (
    <div className="space-y-3">
      <Card>
        <h2 className="font-bold mb-1">🛡️ Civil War</h2>
        <p className="text-[11px] sm:text-xs text-muted-foreground">
          Every accepted rivalry slots both players onto opposite sides — Team A
          vs Team B. Mates and teams stay hidden until the match starts.
        </p>
      </Card>

      {matches.length === 0 ? (
        <Card>
          <p className="text-xs sm:text-sm text-muted-foreground">
            You&apos;re not part of any active Civil War yet. Accept a rivalry
            challenge to join one.
          </p>
        </Card>
      ) : (
        matches.map((m) => <CivilWarCard key={m.matchId} m={m} />)
      )}
    </div>
  );
}

function CivilWarCard({ m }: { m: CivilWarMatchView }) {
  // Once the server reveals (match started), stay revealed.
  const [locallyRevealed, setLocallyRevealed] = useState(m.revealed);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (m.revealed) setLocallyRevealed(true);
  }, [m.revealed]);

  const onReveal = () => {
    setAnimating(true);
    requestAnimationFrame(() => {
      setLocallyRevealed(true);
      try {
        window.localStorage.setItem(REVEAL_KEY(m.matchId), "1");
      } catch {
        /* ignore */
      }
      window.setTimeout(() => setAnimating(false), 900);
    });
  };

  const showClear = m.revealed && locallyRevealed;
  const enoughRivalries = m.totalMembers >= m.minRivalriesRequired * 2;
  const members = m.members ?? [];
  const teamA = members.filter((mem) => mem.side === "A");
  const teamB = members.filter((mem) => mem.side === "B");

  // Live points feed — only meaningful once revealed and not yet settled.
  const liveEnabled = showClear && !m.settled;
  const live = useLiveCivilWar(liveEnabled ? m.matchId : "");
  const liveByUserId = new Map<string, { fp: number; matched: boolean }>();
  if (live.data && live.data.ok && "available" in live.data && live.data.available) {
    for (const mem of live.data.teamA.members) {
      liveByUserId.set(mem.userId, { fp: mem.fantasyPoints, matched: mem.matched });
    }
    for (const mem of live.data.teamB.members) {
      liveByUserId.set(mem.userId, { fp: mem.fantasyPoints, matched: mem.matched });
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-bold text-sm sm:text-base">{m.teamLabel}</p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(m.startTime).toLocaleString()} · {m.status}
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {m.totalMembers} player{m.totalMembers === 1 ? "" : "s"}
        </span>
      </div>

      {!m.revealed && !enoughRivalries && (
        <p className="text-[11px] text-muted-foreground mb-2 text-center">
          Needs at least {m.minRivalriesRequired} accepted rivalr
          {m.minRivalriesRequired === 1 ? "y" : "ies"} (currently{" "}
          {Math.floor(m.totalMembers / 2)}).
        </p>
      )}

      {showClear && !m.settled && (
        <div className="mb-3">
          <CivilWarLivePanel
            data={live.data}
            loading={live.loading}
            refresh={live.refresh}
            canRefresh={live.canRefresh}
            cooldownLeftMs={live.cooldownLeftMs}
            refreshing={live.refreshing}
            now={live.now}
            teamAName={m.teamAName}
            teamBName={m.teamBName}
          />
        </div>
      )}

      <div className="relative">
        <div
          className={[
            "grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-stretch transition-all duration-700 ease-out",
            showClear
              ? "blur-0 opacity-100 select-text"
              : "blur-md opacity-80 select-none pointer-events-none",
          ].join(" ")}
          aria-hidden={!showClear}
        >
          <TeamPanel
            matchId={m.matchId}
            side="A"
            name={m.teamAName}
            members={teamA}
            myUserId={m.myUserId}
            canRename={showClear && m.mySide === "A" && m.amICaptain}
            highlighted={showClear && m.mySide === "A"}
            liveByUserId={liveEnabled ? liveByUserId : null}
          />

          {/* VS divider: horizontal on mobile, vertical on desktop */}
          <div className="flex md:flex-col items-center justify-center gap-2 md:px-1">
            <span className="hidden md:block h-full w-px bg-border" />
            <span className="md:my-1 inline-flex items-center justify-center h-7 w-7 rounded-full border border-border bg-card text-[10px] font-bold tracking-wider text-muted-foreground shadow-sm">
              VS
            </span>
            <span className="block md:hidden flex-1 h-px bg-border" />
            <span className="hidden md:block h-full w-px bg-border" />
          </div>

          <TeamPanel
            matchId={m.matchId}
            side="B"
            name={m.teamBName}
            members={teamB}
            myUserId={m.myUserId}
            canRename={showClear && m.mySide === "B" && m.amICaptain}
            highlighted={showClear && m.mySide === "B"}
            liveByUserId={liveEnabled ? liveByUserId : null}
          />
        </div>

        {!showClear && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg bg-background/85 backdrop-blur-sm border shadow px-4 py-3 text-center max-w-[18rem]">
              {m.revealed ? (
                <>
                  <p className="text-sm mb-2">🕵️ Teams are ready</p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Tap to lift the fog of war.
                  </p>
                  <Button size="sm" onClick={onReveal} disabled={animating}>
                    Reveal teams
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm">🔒 Hidden until match start</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    The reveal button unlocks at start time.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {m.settled && m.result && showClear && (
        <div className="mt-3 rounded-md border bg-background p-3 text-xs sm:text-sm">
          <p className="font-semibold mb-1">⚔️ Result</p>
          {m.result.outcome === "draw" ? (
            <p className="text-muted-foreground">
              Both teams ended dead even — no points awarded.
            </p>
          ) : m.result.outcome === "not_eligible" ? (
            <p className="text-muted-foreground">
              Civil War was cancelled — not enough accepted rivalries this match.
            </p>
          ) : (
            <>
              <p>
                {OUTCOME_LABEL[m.result.outcome] ?? m.result.outcome} —{" "}
                <strong>
                  {m.result.outcome.startsWith("A_") ? m.teamAName : m.teamBName}
                </strong>{" "}
                takes it.
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                1v1 winners: {m.result.teamAWinners} – {m.result.teamBWinners} ·
                FP: {m.result.teamAFp} – {m.result.teamBFp}
              </p>
              <p className="text-[11px] mt-1">
                Per-member points · {m.teamAName}:{" "}
                <span
                  className={
                    m.result.teamAPointsPerMember >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {m.result.teamAPointsPerMember >= 0 ? "+" : ""}
                  {m.result.teamAPointsPerMember}
                </span>{" "}
                · {m.teamBName}:{" "}
                <span
                  className={
                    m.result.teamBPointsPerMember >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {m.result.teamBPointsPerMember >= 0 ? "+" : ""}
                  {m.result.teamBPointsPerMember}
                </span>
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function TeamPanel({
  matchId,
  side,
  name,
  members,
  myUserId,
  canRename,
  highlighted,
  liveByUserId,
}: {
  matchId: string;
  side: "A" | "B";
  name: string;
  members: Array<{ userId: string; username: string; side: "A" | "B"; isCaptain?: boolean }>;
  myUserId: string;
  canRename: boolean;
  highlighted: boolean;
  liveByUserId: Map<string, { fp: number; matched: boolean }> | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!value.trim()) return;
    startTransition(async () => {
      const res = await renameCivilWarTeamAction({
        matchId,
        side,
        name: value.trim(),
      });
      if (res.ok) {
        toast.success("Team renamed");
        setEditing(false);
      } else {
        toast.error(res.error ?? "Could not rename");
      }
    });
  };

  const sideTheme =
    side === "A"
      ? {
          tint: "bg-[rgb(var(--primary)/0.06)]",
          border: "border-[rgb(var(--primary)/0.25)]",
          dot: "bg-[rgb(var(--primary))]",
          chip: "bg-[rgb(var(--primary)/0.12)] border-[rgb(var(--primary)/0.3)]",
        }
      : {
          tint: "bg-[rgb(var(--accent)/0.06)]",
          border: "border-[rgb(var(--accent)/0.25)]",
          dot: "bg-[rgb(var(--accent))]",
          chip: "bg-[rgb(var(--accent)/0.12)] border-[rgb(var(--accent)/0.3)]",
        };

  return (
    <div
      className={[
        "group relative rounded-xl border bg-card/60 backdrop-blur-[1px] p-3 sm:p-4 transition-shadow",
        sideTheme.border,
        highlighted ? "shadow-md ring-1 ring-[rgb(var(--ring)/0.4)]" : "shadow-sm",
      ].join(" ")}
    >
      {/* subtle side tint */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl ${sideTheme.tint}`}
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex items-center justify-center h-5 w-5 rounded-full border ${sideTheme.chip}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${sideTheme.dot}`} />
            </span>
            <span className="text-[11px] text-muted-foreground">
              {members.length} {members.length === 1 ? "player" : "players"}
            </span>
          </div>
          {!editing && canRename && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setEditing(true)}
            >
              Rename
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-1.5 mb-3">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={40}
              className="h-8 text-sm"
              disabled={pending}
              autoFocus
            />
            <Button size="sm" onClick={submit} disabled={pending}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setValue(name);
              }}
              disabled={pending}
            >
              ✕
            </Button>
          </div>
        ) : (
          <h3 className="text-base sm:text-lg font-semibold tracking-tight mb-3 truncate">
            {name}
          </h3>
        )}

        <ul className="space-y-1">
          {members.length === 0 && (
            <li className="text-[11px] text-muted-foreground italic px-1 py-1">
              No members yet.
            </li>
          )}
          {members.map((mem) => {
            const isMe = mem.userId === myUserId;
            const live = liveByUserId?.get(mem.userId) ?? null;
            return (
              <li
                key={mem.userId}
                className={[
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isMe
                    ? "bg-card text-foreground font-medium border border-border/60"
                    : "text-foreground/80 hover:bg-card/80",
                ].join(" ")}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${sideTheme.dot}`} />
                  <span className="truncate">{mem.username}</span>
                  {mem.isCaptain && (
                    <span
                      className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0"
                      title="Captain — leaderboard top on this side"
                    >
                      C
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {live && live.matched && (
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        mem.isCaptain ? "text-amber-600 dark:text-amber-300" : ""
                      }`}
                      title="Live fantasy points (My11)"
                    >
                      {live.fp}
                    </span>
                  )}
                  {isMe && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                      you
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
