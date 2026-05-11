"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resetPredictionAction } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface UserPred {
  id: string;
  username: string;
  handle: string;
  hasPrediction: boolean;
}

export function PredictionResetPanel({
  matchId,
  users,
  canReset,
}: {
  matchId: string;
  users: UserPred[];
  canReset: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirmUser, setConfirmUser] = useState<UserPred | null>(null);

  const reset = (user: UserPred) => {
    setConfirmUser(user);
  };

  const confirmReset = () => {
    if (!confirmUser) return;
    const userId = confirmUser.id;
    const name = confirmUser.username;
    setConfirmUser(null);
    start(async () => {
      try {
        await resetPredictionAction(matchId, userId);
        toast.success(`${name}'s prediction reset`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }
;

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">🔓 Reset predictions</h2>
        <span className="text-xs text-muted-foreground">
          Allowed only before the prediction window closes
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Admins can&apos;t see player predictions — only reset them so a player can re-submit.
        Players who don&apos;t submit just receive 0 prediction points.
      </p>
      <div className="space-y-1.5">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
          >
            <div className="text-sm">
              <span className="font-medium">{u.username}</span>{" "}
              <span className="text-xs text-muted-foreground">@{u.handle}</span>
              {u.hasPrediction ? (
                <span className="ml-2 text-xs text-success">✅ submitted</span>
              ) : (
                <span className="ml-2 text-xs text-muted-foreground">— not submitted</span>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => reset(u)}
              disabled={pending || !canReset || !u.hasPrediction}
            >
              Reset
            </Button>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirmUser}
        title="Confirm reset"
        description={
          confirmUser
            ? `Reset ${confirmUser.username}'s prediction? They'll be able to re-submit.`
            : "Are you sure you want to reset this prediction?"
        }
        confirmLabel="Reset"
        cancelLabel="Cancel"
        loading={pending}
        onConfirm={confirmReset}
        onCancel={() => setConfirmUser(null)}
      />
    </Card>
  );
}
