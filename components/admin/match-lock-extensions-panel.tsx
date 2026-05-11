"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateMatchLockExtensionsAction } from "@/actions/admin";

export function MatchLockExtensionsPanel({
  matchId,
  initial,
}: {
  matchId: string;
  initial: {
    predictionLockExtensionMinutes?: number;
    rivalryLockExtensionMinutes?: number;
  };
}) {
  const [pending, start] = useTransition();
  const [predictionMinutes, setPredictionMinutes] = useState(
    String(initial.predictionLockExtensionMinutes ?? 0)
  );
  const [rivalryMinutes, setRivalryMinutes] = useState(
    String(initial.rivalryLockExtensionMinutes ?? 0)
  );

  const save = () =>
    start(async () => {
      const predictionLockExtensionMinutes = Number(predictionMinutes);
      const rivalryLockExtensionMinutes = Number(rivalryMinutes);
      if (
        Number.isNaN(predictionLockExtensionMinutes) ||
        Number.isNaN(rivalryLockExtensionMinutes) ||
        predictionLockExtensionMinutes < 0 ||
        rivalryLockExtensionMinutes < 0
      ) {
        toast.error("Enter valid non-negative minutes");
        return;
      }
      const r = await updateMatchLockExtensionsAction({
        matchId,
        predictionLockExtensionMinutes,
        rivalryLockExtensionMinutes,
      });
      if (r.ok) toast.success("Lock extensions updated");
      else toast.error(r.error ?? "Failed");
    });

  return (
    <Card>
      <h2 className="font-semibold mb-2">⏱️ Lock extensions</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Minutes added after the scheduled start. Prediction lock also covers custom pools.
      </p>
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
      <div className="mt-4">
        <Button variant="glow" onClick={save} loading={pending}>
          {pending ? "Saving…" : "Save lock extensions"}
        </Button>
      </div>
    </Card>
  );
}