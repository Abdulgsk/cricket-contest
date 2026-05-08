"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateMatchModesAction } from "@/actions/admin";

export function MatchModesPanel({
  matchId,
  initial,
  disabled = false,
}: {
  matchId: string;
  initial: {
    doublePoints?: boolean;
    chaosMatch?: boolean;
    noBonus?: boolean;
    predictionMadness?: boolean;
  };
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [modes, setModes] = useState({
    doublePoints: !!initial.doublePoints,
    chaosMatch: !!initial.chaosMatch,
    noBonus: !!initial.noBonus,
    predictionMadness: !!initial.predictionMadness,
  });

  const save = () =>
    start(async () => {
      const r = await updateMatchModesAction({ matchId, ...modes });
      if (r?.ok) toast.success("Match modes updated");
      else toast.error(r?.error ?? "Failed");
    });

  const Row = (key: keyof typeof modes, label: string, hint: string) => (
    <label className="flex items-start gap-2 rounded-xl bg-muted/30 p-3 cursor-pointer">
      <input
        type="checkbox"
        checked={modes[key]}
        disabled={disabled}
        onChange={(e) => setModes((m) => ({ ...m, [key]: e.target.checked }))}
        className="mt-0.5"
      />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </label>
  );

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">⚡ Special Match Modes</h2>
        {disabled && (
          <span className="text-xs text-muted-foreground">Match completed — locked</span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {Row("doublePoints", "2× Points", "All rank points doubled.")}
        {Row("noBonus", "No Bonus", "Bonuses disabled this match.")}
        {Row("chaosMatch", "Chaos Match", "Bonus rules apply with extra drama.")}
        {Row("predictionMadness", "Prediction Madness", "Prediction points apply with extra weight.")}
      </div>
      <div className="mt-3">
        <Button variant="glow" onClick={save} loading={pending} disabled={disabled}>
          {pending ? "Saving…" : "Save modes"}
        </Button>
      </div>
    </Card>
  );
}
