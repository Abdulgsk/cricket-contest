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
  isSuperadmin = false,
  resultsEntered = false,
}: {
  matchId: string;
  initial: {
    doublePoints?: boolean;
    chaosMatch?: boolean;
    noBonus?: boolean;
    predictionMadness?: boolean;
  };
  disabled?: boolean;
  /** Superadmins can re-toggle modes after results are published. */
  isSuperadmin?: boolean;
  resultsEntered?: boolean;
}) {
  const [pending, start] = useTransition();
  const [modes, setModes] = useState({
    doublePoints: !!initial.doublePoints,
    chaosMatch: !!initial.chaosMatch,
    noBonus: !!initial.noBonus,
    predictionMadness: !!initial.predictionMadness,
  });
  // Superadmins can force re-toggle after publish — opens up the form behind
  // an explicit "Override" gesture so the destructive recompute is intentional.
  const [overrideUnlocked, setOverrideUnlocked] = useState(false);

  const effectiveDisabled =
    disabled && !(isSuperadmin && overrideUnlocked);

  const save = () => {
    if (resultsEntered) {
      const ok = window.confirm(
        "Match modes only take effect when results are recomputed. " +
          "After saving, re-publish the match results to apply the new modes.\n\n" +
          "Continue?",
      );
      if (!ok) return;
    }
    start(async () => {
      const r = await updateMatchModesAction({ matchId, ...modes });
      if (r?.ok) toast.success("Match modes updated");
      else toast.error(r?.error ?? "Failed");
    });
  };

  const Row = (key: keyof typeof modes, label: string, hint: string) => (
    <label
      className={`flex items-start gap-2 rounded-xl bg-muted/30 p-3 ${effectiveDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={modes[key]}
        disabled={effectiveDisabled}
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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold">⚡ Special Match Modes</h2>
        {disabled && !overrideUnlocked && (
          <span className="text-xs text-muted-foreground">
            {resultsEntered ? "Match completed — locked" : "Locked"}
          </span>
        )}
        {disabled && isSuperadmin && !overrideUnlocked && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOverrideUnlocked(true)}
          >
            Override
          </Button>
        )}
        {overrideUnlocked && (
          <span className="text-xs text-warning font-medium">
            ⚠️ Override mode — re-publish to apply
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {Row("doublePoints", "2× Points", "All rank points doubled.")}
        {Row("noBonus", "No Bonus", "Bonuses disabled this match.")}
        {Row("chaosMatch", "Chaos Match", "Bonus rules apply with extra drama.")}
        {Row("predictionMadness", "Prediction Madness", "Prediction points apply with extra weight.")}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="glow"
          onClick={save}
          loading={pending}
          disabled={effectiveDisabled}
        >
          {pending ? "Saving…" : "Save modes"}
        </Button>
        {overrideUnlocked && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOverrideUnlocked(false);
              setModes({
                doublePoints: !!initial.doublePoints,
                chaosMatch: !!initial.chaosMatch,
                noBonus: !!initial.noBonus,
                predictionMadness: !!initial.predictionMadness,
              });
            }}
          >
            Cancel override
          </Button>
        )}
      </div>
    </Card>
  );
}
