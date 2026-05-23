"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateMatchLockExtensionsAction } from "@/actions/admin";
import { getModuleLockDeadline } from "@/lib/match-locks";
import { formatDate } from "@/lib/utils";

export function MatchLockExtensionsPanel({
  matchId,
  startTime,
  initial,
}: {
  matchId: string;
  startTime: Date | string;
  initial: {
    predictionLockExtensionMinutes?: number;
    rivalryLockExtensionMinutes?: number;
    predictionLockExtensionAppliedAt?: Date | string | null;
    rivalryLockExtensionAppliedAt?: Date | string | null;
  };
}) {
  const [pending, start] = useTransition();
  const [predictionMinutes, setPredictionMinutes] = useState(
    String(initial.predictionLockExtensionMinutes ?? 0)
  );
  const [rivalryMinutes, setRivalryMinutes] = useState(
    String(initial.rivalryLockExtensionMinutes ?? 0)
  );

  const now = new Date();
  const predictionDeadline = useMemo(
    () =>
      getModuleLockDeadline(
        {
          startTime,
          predictionLockExtensionMinutes: initial.predictionLockExtensionMinutes ?? 0,
          predictionLockExtensionAppliedAt: initial.predictionLockExtensionAppliedAt ?? null,
        },
        "predictions"
      ),
    [
      startTime,
      initial.predictionLockExtensionMinutes,
      initial.predictionLockExtensionAppliedAt,
    ]
  );
  const rivalryDeadline = useMemo(
    () =>
      getModuleLockDeadline(
        {
          startTime,
          rivalryLockExtensionMinutes: initial.rivalryLockExtensionMinutes ?? 0,
          rivalryLockExtensionAppliedAt: initial.rivalryLockExtensionAppliedAt ?? null,
        },
        "rivalry"
      ),
    [
      startTime,
      initial.rivalryLockExtensionMinutes,
      initial.rivalryLockExtensionAppliedAt,
    ]
  );
  const predictionLocked = now.getTime() >= predictionDeadline.getTime();
  const rivalryLocked = now.getTime() >= rivalryDeadline.getTime();

  const submit = (predN: number, rivN: number) =>
    start(async () => {
      if (predN < 0 || rivN < 0) {
        toast.error("Enter valid non-negative minutes");
        return;
      }
      const r = await updateMatchLockExtensionsAction({
        matchId,
        predictionLockExtensionMinutes: predN,
        rivalryLockExtensionMinutes: rivN,
      });
      if (r.ok) toast.success("Lock extensions updated · all players unlocked");
      else toast.error(r.error ?? "Failed");
    });

  const save = () => {
    const p = Number(predictionMinutes);
    const r = Number(rivalryMinutes);
    if (Number.isNaN(p) || Number.isNaN(r)) {
      toast.error("Enter valid numbers");
      return;
    }
    submit(p, r);
  };

  const quickReopen = (minutes: number) => {
    setPredictionMinutes(String(minutes));
    setRivalryMinutes(String(minutes));
    submit(minutes, minutes);
  };

  const fmt = (d: Date) => formatDate(d);

  return (
    <Card>
      <h2 className="font-semibold mb-2">⏱️ Lock extensions</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Minutes added on top of the scheduled start. Saving any value re-stamps the
        applied-at timestamp to now, so deadlines shift forward immediately for all players.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Predictions</span>
            <span className={predictionLocked ? "text-warning" : "text-success"}>
              {predictionLocked ? "🔒 locked" : "🔓 open"}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5">until {fmt(predictionDeadline)}</div>
        </div>
        <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Rivalries</span>
            <span className={rivalryLocked ? "text-warning" : "text-success"}>
              {rivalryLocked ? "🔒 locked" : "🔓 open"}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5">until {fmt(rivalryDeadline)}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prediction-lock">Prediction module (minutes)</Label>
          <Input
            id="prediction-lock"
            type="number"
            min={0}
            value={predictionMinutes}
            onChange={(e) => setPredictionMinutes(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rivalry-lock">Rivalry module (minutes)</Label>
          <Input
            id="rivalry-lock"
            type="number"
            min={0}
            value={rivalryMinutes}
            onChange={(e) => setRivalryMinutes(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="glow" onClick={save} loading={pending}>
          {pending ? "Saving…" : "Save lock extensions"}
        </Button>
        <Button variant="outline" onClick={() => quickReopen(30)} loading={pending}>
          Reopen +30m
        </Button>
        <Button variant="outline" onClick={() => quickReopen(120)} loading={pending}>
          Reopen +2h
        </Button>
        <Button variant="outline" onClick={() => quickReopen(0)} loading={pending}>
          Reset to scheduled lock
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Tip: for a live match, 0 minutes means the deadline = now, so the module stays locked. Use
        +30m or +2h to actually reopen.
      </p>
    </Card>
  );
}