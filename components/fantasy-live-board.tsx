"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui/card";
import { recomputeFantasyAction } from "@/actions/fantasy-team";
import type { FantasyRole } from "@/lib/constants";

type Player = {
  name: string;
  teamShort?: string;
  fantasyRole: FantasyRole;
  isCaptain: boolean;
  isViceCaptain: boolean;
  points: number;
  basePoints: number;
  isSub?: boolean;
  isImpact?: boolean;
  isNotPlaying?: boolean;
  replacedByName?: string | null;
};

type Row = {
  rank: number;
  userId: string;
  userName: string;
  isMe: boolean;
  captain: string;
  viceCaptain: string;
  totalPoints: number;
  players: Player[];
};

export function FantasyLiveBoard({
  matchId,
  rows,
  pointsComputedAt,
  status,
}: {
  matchId: string;
  rows: Row[];
  pointsComputedAt: string | null;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function refresh() {
    setMsg(null);
    start(async () => {
      const res = await recomputeFantasyAction(matchId);
      if (!res.ok) setMsg(res.error ?? "Could not refresh");
      else if (!res.hasData) setMsg("No scorecard data yet — check back once play begins.");
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Live leaderboard</h2>
          {pointsComputedAt && (
            <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
              Updated {new Date(pointsComputedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={status === "live" ? "danger" : status === "completed" ? "success" : "accent"}>
            {status}
          </Badge>
          <button
            onClick={refresh}
            disabled={pending}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-warning">{msg}</p>}

      {!rows.length ? (
        <p className="text-sm text-muted-foreground">No teams were saved for this match.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const expanded = open === r.userId;
            return (
              <li key={r.userId} className="py-2">
                <button
                  onClick={() => setOpen(expanded ? null : r.userId)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-6 text-center text-sm font-bold text-muted-foreground">
                      {r.rank}
                    </span>
                    <span className={`truncate font-medium ${r.isMe ? "text-primary" : ""}`}>
                      {r.userName}
                      {r.isMe && <span className="text-[11px] ml-1">(you)</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-base font-bold tabular-nums">{r.totalPoints}</span>
                    <span className="text-xs text-muted-foreground">{expanded ? "▲" : "▼"}</span>
                  </span>
                </button>

                {expanded && (
                  <div className="mt-2 rounded-md bg-muted/40 p-2 space-y-1">
                    {r.players
                      .slice()
                      .sort((a, b) => b.points - a.points)
                      .map((p, i) => (
                        <div
                          key={`${p.name}-${i}`}
                          className={`flex items-center justify-between gap-2 text-sm ${
                            p.replacedByName ? "opacity-50" : ""
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] font-semibold text-muted-foreground w-8 shrink-0">
                              {p.fantasyRole}
                            </span>
                            <span className={`truncate ${p.replacedByName ? "line-through" : ""}`}>
                              {p.name}
                            </span>
                            {p.isCaptain && (
                              <span className="text-[10px] font-bold text-primary">C</span>
                            )}
                            {p.isViceCaptain && (
                              <span className="text-[10px] font-bold text-warning">VC</span>
                            )}
                            {p.isImpact && (
                              <span className="rounded bg-accent/20 px-1 text-[9px] font-bold text-accent">
                                IMP
                              </span>
                            )}
                            {p.isSub && (
                              <span className="rounded bg-success/20 px-1 text-[9px] font-bold text-success">
                                SUB
                              </span>
                            )}
                            {p.replacedByName && (
                              <span className="text-[9px] text-muted-foreground">
                                → {p.replacedByName}
                              </span>
                            )}
                            {!p.replacedByName && !p.isSub && p.isNotPlaying && (
                              <span className="rounded bg-danger/15 px-1 text-[9px] font-bold text-danger">
                                NP
                              </span>
                            )}
                            {p.teamShort && (
                              <span className="text-[10px] text-muted-foreground">{p.teamShort}</span>
                            )}
                          </span>
                          <span className="tabular-nums font-medium shrink-0">
                            {p.points}
                            {(p.isCaptain || p.isViceCaptain) && (
                              <span className="text-[10px] text-muted-foreground ml-1">
                                ({p.basePoints})
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
