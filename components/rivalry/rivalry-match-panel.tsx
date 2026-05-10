"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  createRivalryAction,
  respondRivalryAction,
  cancelRivalryAction,
} from "@/actions/rivalry";

type Opponent = {
  id: string;
  username: string;
  handle?: string;
  recommended?: boolean;
};
type BusyPlayer = { id: string; username: string };
type ActiveRivalry = {
  id?: string;
  role?: "challenger" | "opponent";
  opponent?: { username?: string } | null | undefined;
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
};

interface Props {
  matchId: string;
  meId: string;
  matchStarted: boolean;
  eligibleOpponents: Opponent[];
  busyPlayers: BusyPlayer[];
  myActive: ActiveRivalry | null;
  all: { id: string; challenger: string; opponent: string; status: string }[];
}

export function RivalryMatchPanel({
  matchId,
  matchStarted,
  eligibleOpponents,
  busyPlayers,
  myActive,
  all,
}: Props) {
  const [opponentId, setOpponentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { recommended, others } = useMemo(() => {
    const rec = eligibleOpponents.filter((u) => u.recommended);
    const oth = eligibleOpponents.filter((u) => !u.recommended);
    return { recommended: rec, others: oth };
  }, [eligibleOpponents]);

  function clear() {
    setError(null);
    setMessage(null);
  }

  function challenge() {
    clear();
    if (!opponentId) {
      setError("Pick a player to challenge");
      return;
    }
    startTransition(async () => {
      const res = await createRivalryAction({ matchId, opponentId });
      if (!res.ok) setError(res.error);
      else {
        setMessage("Challenge sent!");
        setOpponentId("");
      }
    });
  }

  function respond(accept: boolean) {
    if (!myActive?.id) return;
    clear();
    startTransition(async () => {
      const res = await respondRivalryAction({ rivalryId: myActive.id!, accept });
      if (!res.ok) setError(res.error);
      else setMessage(accept ? "Accepted!" : "Declined");
    });
  }

  function cancel() {
    if (!myActive?.id) return;
    const ok = window.confirm(
      myActive.status === "accepted"
        ? "Withdraw this accepted challenge?\n\nYou will lose -2 points and your rival will be notified."
        : "Cancel this pending challenge?\n\nYou will lose -2 points and the other player will be notified."
    );
    if (!ok) return;
    clear();
    startTransition(async () => {
      const res = await cancelRivalryAction({ rivalryId: myActive.id! });
      if (!res.ok) setError(res.error);
      else setMessage("Challenge withdrawn (-2)");
    });
  }

  return (
    <div className="space-y-3">
      {matchStarted && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          🔒 Match has started — rivalries are locked. No new challenges and no withdrawals.
        </div>
      )}

      {myActive ? (
        <div className="rounded-lg border border-border p-3 bg-muted/40 space-y-2">
          {myActive.status === "pending" && myActive.role === "challenger" && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm break-words">
                You challenged <strong>{myActive.opponent?.username}</strong> — waiting for them to
                accept.
              </p>
              {!matchStarted && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancel}
                  loading={pending}
                  className="w-full sm:w-auto"
                >
                  Withdraw (−2)
                </Button>
              )}
            </div>
          )}
          {myActive.status === "pending" && myActive.role === "opponent" && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm break-words">
                <strong>{myActive.opponent?.username}</strong> challenged you ⚔️
              </p>
              {!matchStarted && (
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    size="sm"
                    onClick={() => respond(true)}
                    loading={pending}
                    className="flex-1 sm:flex-none"
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respond(false)}
                    loading={pending}
                    className="flex-1 sm:flex-none"
                  >
                    Decline
                  </Button>
                </div>
              )}
            </div>
          )}
          {myActive.status === "accepted" && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm break-words">
                ⚔️ Active rivalry with <strong>{myActive.opponent?.username}</strong>. Finish above
                them to earn <span className="text-success">+3</span>.
              </p>
              {!matchStarted && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancel}
                  loading={pending}
                  className="w-full sm:w-auto"
                >
                  Withdraw (−2)
                </Button>
              )}
            </div>
          )}
        </div>
      ) : matchStarted ? null : (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="h-11 px-3 rounded-xl border border-border bg-background text-sm flex-1 min-w-0"
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              disabled={pending || eligibleOpponents.length === 0}
            >
              <option value="">
                {eligibleOpponents.length === 0
                  ? "No players available"
                  : "Select a player to challenge..."}
              </option>
              {recommended.length > 0 && (
                <optgroup label="⭐ Recommended (no rivalry yet today)">
                  {recommended.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                      {u.handle ? ` (${u.handle})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other players">
                  {others.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                      {u.handle ? ` (${u.handle})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <Button
              onClick={challenge}
              loading={pending}
              disabled={!opponentId}
              className="w-full sm:w-auto"
            >
              Challenge
            </Button>
          </div>
          {recommended.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              💡 Recommended players have no active rivalry yet today.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger break-words">{error}</p>}
      {message && <p className="text-xs text-success break-words">{message}</p>}

      {busyPlayers.length > 0 && !myActive && !matchStarted && (
        <p className="text-[11px] text-muted-foreground break-words">
          Already in a challenge for this match: {busyPlayers.map((u) => u.username).join(", ")}
        </p>
      )}

      {all.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            All rivalries for this match ({all.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {all.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline"
              >
                <span className="break-words">
                  {r.challenger} <span className="text-muted-foreground">vs</span> {r.opponent}
                </span>
                <span className="text-muted-foreground">— {r.status}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
