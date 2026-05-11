"use client";

import { useMemo, useState, useTransition } from "react";
import { createRivalryAction, requestRivalryWithdrawalAction, respondRivalryAction, cancelRivalryAction } from "@/actions/rivalry";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Opponent = {
  id: string;
  username: string;
  handle?: string;
  isRevenge?: boolean;
};

type MyRivalry = {
  id: string;
  role: "challenger" | "opponent";
  opponent: { username: string };
  status: string;
  withdrawalRequestedAt?: string | Date | null;
  withdrawalRequestedBy?: string | null;
};

interface Props {
  matchId: string;
  rivalryLocked: boolean;
  rivalryLockReason?: "waiting_prior" | "started" | null;
  unfinishedPriors?: { teamA: string; teamB: string }[];
  eligibleOpponents: Opponent[];
  myRivalries: MyRivalry[];
  all: { id: string; challenger: string; opponent: string; status: string }[];
}

export function RivalryMatchPanel({
  matchId,
  rivalryLocked,
  rivalryLockReason,
  unfinishedPriors,
  eligibleOpponents,
  myRivalries,
  all,
}: Props) {
  const [opponentId, setOpponentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<{
    rivalryId: string;
    kind: "cancel" | "request";
    title: string;
    message: string;
    confirmLabel: string;
  } | null>(null);

  const selected = useMemo(
    () => eligibleOpponents.find((u) => u.id === opponentId) ?? null,
    [opponentId, eligibleOpponents]
  );

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

  function respond(rivalryId: string, accept: boolean) {
    clear();
    startTransition(async () => {
      const res = await respondRivalryAction({ rivalryId, accept });
      if (!res.ok) setError(res.error);
      else setMessage(accept ? "Accepted!" : "Declined");
    });
  }

  function cancel(rivalryId: string) {
    setConfirming({
      rivalryId,
      kind: "cancel",
      title: "Confirm withdraw",
      message: "Withdraw this rivalry now?\n\nYou will lose -2 points and the other player will be notified.",
      confirmLabel: "Withdraw",
    });
  }

  function requestWithdraw(rivalryId: string) {
    setConfirming({
      rivalryId,
      kind: "request",
      title: "Request admin withdrawal",
      message: "Send a withdrawal request to the admin?\n\nThe other player will be notified and an admin will approve or reject it. No points are deducted unless approved with a penalty.",
      confirmLabel: "Send request",
    });
  }

  function confirmAction() {
    if (!confirming) return;
    const { rivalryId, kind } = confirming;
    setConfirming(null);
    clear();
    startTransition(async () => {
      if (kind === "cancel") {
        const res = await cancelRivalryAction({ rivalryId });
        if (!res.ok) setError(res.error);
        else setMessage("Challenge withdrawn (-2)");
      } else {
        const res = await requestRivalryWithdrawalAction({ rivalryId });
        if (!res.ok) setError(res.error);
        else setMessage("Withdrawal request sent to admin");
      }
    });
  }

  return (
    <div className="space-y-3">
      {rivalryLocked && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {rivalryLockReason === "waiting_prior" ? (
            <>
              ⏳ Rivalry challenges open once{" "}
              <strong>
                {unfinishedPriors && unfinishedPriors.length > 0
                  ? `${unfinishedPriors[0].teamA} vs ${unfinishedPriors[0].teamB}`
                  : "the earlier match"}
              </strong>{" "}
              results are entered. Check back then — you’ll see the table toppers to target.
            </>
          ) : (
            <>🔒 Rivalries are locked for this match. No new challenges — you can still request an admin withdrawal on existing ones.</>
          )}
        </div>
      )}

      {myRivalries.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium">Your active challenges: {myRivalries.length}</p>
            {!rivalryLocked && (
              <p className="text-[11px] text-muted-foreground">You can open more than one challenge in the same match.</p>
            )}
          </div>

          <div className="space-y-2">
            {myRivalries.map((r) => {
              const hasPendingRequest = !!r.withdrawalRequestedAt;
              return (
                <div key={r.id} className="rounded-lg bg-muted/40 p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm break-words">
                      {r.role === "challenger" ? (
                        <>
                          You challenged <strong>{r.opponent.username}</strong>
                        </>
                      ) : (
                        <>
                          <strong>{r.opponent.username}</strong> challenged you ⚔️
                        </>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      {(r.status === "pending" || r.status === "accepted") && !hasPendingRequest && (
                        <Button size="sm" variant="outline" onClick={() => requestWithdraw(r.id)} loading={pending} className="flex-1 sm:flex-none">
                          Request admin withdraw
                        </Button>
                      )}
                      {!rivalryLocked && (r.status === "pending" || r.status === "accepted") && (
                        <Button size="sm" variant="outline" onClick={() => cancel(r.id)} loading={pending} className="flex-1 sm:flex-none">
                          Withdraw (−2)
                        </Button>
                      )}
                      {!rivalryLocked && r.status === "pending" && r.role === "opponent" && (
                        <>
                          <Button size="sm" onClick={() => respond(r.id, true)} loading={pending} className="flex-1 sm:flex-none">
                            Accept
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => respond(r.id, false)} loading={pending} className="flex-1 sm:flex-none">
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {hasPendingRequest && (
                    <p className="text-[11px] text-muted-foreground">
                      Withdrawal request pending admin approval.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!rivalryLocked && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="h-11 px-3 rounded-xl border border-border bg-background text-sm flex-1 min-w-0"
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              disabled={pending || eligibleOpponents.length === 0}
            >
              <option value="">
                {eligibleOpponents.length === 0 ? "No players available" : "Select a player to challenge..."}
              </option>
              {eligibleOpponents.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                  {u.handle ? ` (${u.handle})` : ""}
                  {u.isRevenge ? " — revenge" : ""}
                </option>
              ))}
            </select>
            <Button onClick={challenge} loading={pending} disabled={!opponentId} className="w-full sm:w-auto">
              {selected?.isRevenge ? "Revenge" : "Challenge"}
            </Button>
          </div>
          {selected?.isRevenge && (
            <p className="text-[11px] text-muted-foreground">
              ⚠️ This is your revenge match against {selected.username}. Win it for <span className="text-success">+3 + 1 bonus</span> point.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger break-words">{error}</p>}
      {message && <p className="text-xs text-success break-words">{message}</p>}

      {all.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">All rivalries for this match ({all.length})</summary>
          <ul className="mt-2 space-y-1">
            {all.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
                <span className="break-words">
                  {r.challenger} <span className="text-muted-foreground">vs</span> {r.opponent}
                </span>
                <span className="text-muted-foreground">— {r.status}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={!!confirming}
        title={confirming?.title ?? "Confirm"}
        description={confirming?.message ?? "Are you sure?"}
        confirmLabel={confirming?.confirmLabel ?? "Confirm"}
        cancelLabel="Cancel"
        loading={pending}
        onConfirm={confirmAction}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
