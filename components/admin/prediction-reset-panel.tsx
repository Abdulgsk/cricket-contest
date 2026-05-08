"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resetPredictionAction } from "@/actions/admin";

interface UserPred {
  id: string;
  username: string;
  handle: string;
  hasPrediction: boolean;
}

export function PredictionResetPanel({
  matchId,
  users,
  matchStarted,
}: {
  matchId: string;
  users: UserPred[];
  matchStarted: boolean;
}) {
  const [pending, start] = useTransition();

  const reset = (userId: string, name: string) => {
    if (!confirm(`Reset ${name}'s prediction? They'll be able to re-submit.`)) return;
    start(async () => {
      try {
        await resetPredictionAction(matchId, userId);
        toast.success(`${name}'s prediction reset`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">🔓 Reset predictions</h2>
        <span className="text-xs text-muted-foreground">
          Allowed only before match starts
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
              onClick={() => reset(u.id, u.username)}
              disabled={pending || matchStarted || !u.hasPrediction}
            >
              Reset
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
