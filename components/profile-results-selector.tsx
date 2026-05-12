"use client";

import { useState } from "react";
import type {
  RivalryHistoryEntry,
  CivilWarHistoryEntry,
} from "@/actions/civil-war";

type Mode = "rivalry" | "civilwar";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

const OUTCOME_LABEL: Record<string, string> = {
  win: "Win",
  loss: "Loss",
  tie: "Tie",
  cancelled: "Withdrawn",
  pending: "Pending",
};

const OUTCOME_TONE: Record<string, string> = {
  win: "text-success",
  loss: "text-destructive",
  tie: "text-muted-foreground",
  cancelled: "text-muted-foreground",
  pending: "text-muted-foreground",
};

const CW_OUTCOME_LABEL: Record<string, string> = {
  A_decisive: "Decisive",
  B_decisive: "Decisive",
  A_split: "Split",
  B_split: "Split",
  A_fp_tiebreak: "FP tiebreak",
  B_fp_tiebreak: "FP tiebreak",
  A_won_clear: "Clear win",
  B_won_clear: "Clear win",
  draw: "Draw",
  not_eligible: "Not eligible",
};

function cwUserResult(entry: CivilWarHistoryEntry): "win" | "loss" | "draw" | "neutral" {
  const o = entry.outcome;
  if (o === "draw") return "draw";
  if (o === "not_eligible") return "neutral";
  const winnerIsA =
    o === "A_decisive" ||
    o === "A_split" ||
    o === "A_won_clear" ||
    o === "A_fp_tiebreak";
  return winnerIsA === (entry.mySide === "A") ? "win" : "loss";
}

export function ProfileResultsSelector({
  rivalries,
  civilWars,
}: {
  rivalries: RivalryHistoryEntry[];
  civilWars: CivilWarHistoryEntry[];
}) {
  const [mode, setMode] = useState<Mode>("rivalry");

  const settledRivalries = rivalries.filter((r) => r.outcome !== "pending");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base sm:text-lg font-semibold">Results</h2>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setMode("rivalry")}
            className={
              "px-3 py-1 text-xs font-medium rounded-md transition " +
              (mode === "rivalry"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            ⚔️ Rivalry
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              ({settledRivalries.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("civilwar")}
            className={
              "px-3 py-1 text-xs font-medium rounded-md transition " +
              (mode === "civilwar"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            🛡️ Civil War
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              ({civilWars.length})
            </span>
          </button>
        </div>
      </div>

      {mode === "rivalry" ? (
        <RivalryTable entries={settledRivalries} />
      ) : (
        <CivilWarTable entries={civilWars} />
      )}
    </div>
  );
}

function RivalryTable({ entries }: { entries: RivalryHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No settled rivalries yet.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm min-w-[520px]">
        <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="text-left border-b border-border">
            <th className="p-2 sm:p-3">Date</th>
            <th className="p-2 sm:p-3">Match</th>
            <th className="p-2 sm:p-3">Opponent</th>
            <th className="p-2 sm:p-3">Role</th>
            <th className="p-2 sm:p-3 text-center">Result</th>
            <th className="p-2 sm:p-3 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((r, i) => {
            const net = r.pointsAwarded - r.penalty;
            return (
              <tr
                key={r.rivalryId}
                className={i % 2 ? "bg-muted/20" : ""}
              >
                <td className="p-2 sm:p-3 text-muted-foreground whitespace-nowrap text-xs">
                  {formatDate(r.startTime)}
                </td>
                <td className="p-2 sm:p-3 truncate max-w-[180px]">{r.matchLabel}</td>
                <td className="p-2 sm:p-3 truncate max-w-[140px]">
                  {r.opponentUsername}
                </td>
                <td className="p-2 sm:p-3 capitalize text-muted-foreground text-xs">
                  {r.myRole}
                </td>
                <td
                  className={`p-2 sm:p-3 text-center font-semibold text-xs ${OUTCOME_TONE[r.outcome] ?? ""}`}
                >
                  {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                </td>
                <td
                  className={`p-2 sm:p-3 text-right font-bold tabular-nums ${
                    net > 0
                      ? "text-success"
                      : net < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {net > 0 ? "+" : ""}
                  {net}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CivilWarTable({ entries }: { entries: CivilWarHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No settled Civil Wars yet.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="text-left border-b border-border">
            <th className="p-2 sm:p-3">Date</th>
            <th className="p-2 sm:p-3">Match</th>
            <th className="p-2 sm:p-3">My team</th>
            <th className="p-2 sm:p-3">Type</th>
            <th className="p-2 sm:p-3 text-center">Result</th>
            <th className="p-2 sm:p-3 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((c, i) => {
            const res = cwUserResult(c);
            const tone =
              res === "win"
                ? "text-success"
                : res === "loss"
                  ? "text-destructive"
                  : "text-muted-foreground";
            const label =
              res === "win"
                ? "Win"
                : res === "loss"
                  ? "Loss"
                  : res === "draw"
                    ? "Draw"
                    : "—";
            return (
              <tr key={c.matchId} className={i % 2 ? "bg-muted/20" : ""}>
                <td className="p-2 sm:p-3 text-muted-foreground whitespace-nowrap text-xs">
                  {formatDate(c.startTime)}
                </td>
                <td className="p-2 sm:p-3 truncate max-w-[180px]">{c.matchLabel}</td>
                <td className="p-2 sm:p-3 truncate max-w-[140px]">
                  {c.wasCaptain && <span className="text-amber-500 mr-1">👑</span>}
                  {c.myTeamName}
                </td>
                <td className="p-2 sm:p-3 text-muted-foreground text-xs">
                  {CW_OUTCOME_LABEL[c.outcome] ?? c.outcome}
                </td>
                <td
                  className={`p-2 sm:p-3 text-center font-semibold text-xs ${tone}`}
                >
                  {label}
                </td>
                <td
                  className={`p-2 sm:p-3 text-right font-bold tabular-nums ${
                    c.myPoints > 0
                      ? "text-success"
                      : c.myPoints < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {c.myPoints > 0 ? "+" : ""}
                  {c.myPoints}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
