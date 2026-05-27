"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  setPlayerDirectoryEnabledAction,
  backfillPlayerDirectoryAction,
} from "@/actions/admin";

/**
 * Superadmin-only panel for the Player directory (new contest flow).
 *
 * - Toggle: master kill-switch. When off, the contest tab reverts to the
 *   previous behaviour (no Player upserts, no "Player ownership" lookup UI).
 *   Use this if the new flow misbehaves mid-match.
 * - Backfill: walks every existing `UserMatchTeam.players` row and seeds the
 *   `Player` collection. Idempotent.
 */
export function PlayerDirectoryPanel({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pendingToggle, startToggle] = useTransition();
  const [pendingBackfill, startBackfill] = useTransition();
  const [lastResult, setLastResult] = useState<{
    observed: number;
    distinct: number;
    upserted: number;
    modified: number;
  } | null>(null);

  const toggle = () =>
    startToggle(async () => {
      const next = !enabled;
      const res = await setPlayerDirectoryEnabledAction(next);
      if (res.ok) {
        setEnabled(res.value);
        toast.success(
          res.value
            ? "Player directory enabled (new flow active)"
            : "Player directory disabled — using previous flow"
        );
      } else {
        toast.error(res.error ?? "Failed to update setting");
      }
    });

  const backfill = () =>
    startBackfill(async () => {
      const res = await backfillPlayerDirectoryAction();
      if (res.ok) {
        setLastResult({
          observed: res.observed,
          distinct: res.distinct,
          upserted: res.upserted,
          modified: res.modified ?? 0,
        });
        toast.success(
          `Backfill done · ${res.distinct} distinct players (${res.upserted} new)`
        );
      } else {
        toast.error(res.error ?? "Backfill failed");
      }
    });

  return (
    <Card className="space-y-3 border-border/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">🆕 Player Directory (contest)</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Master switch for the new contest flow: persisting every my11
            roster into the <code className="rounded bg-muted px-1">Player</code>{" "}
            collection + the &ldquo;Player ownership&rdquo; search panel.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            enabled
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning"
          }`}
        >
          {enabled ? "New flow" : "Legacy flow"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={enabled ? "outline" : "default"}
          loading={pendingToggle}
          onClick={toggle}
        >
          {enabled ? "Disable (use previous flow)" : "Enable new flow"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={pendingBackfill}
          onClick={backfill}
          disabled={!enabled}
          title={
            enabled
              ? "Seed the Player directory from existing team data"
              : "Enable the directory first"
          }
        >
          Backfill from existing teams
        </Button>
      </div>

      {lastResult && (
        <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
          <div className="font-medium">Last backfill:</div>
          <div className="text-muted-foreground">
            Observed {lastResult.observed} roster entries · {lastResult.distinct}{" "}
            distinct players · {lastResult.upserted} new · {lastResult.modified}{" "}
            updated.
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tip: if the contest tab misbehaves during a live match, flip this
        off — fantasy scoring and the rest of the app are unaffected. Turn
        it back on after the match.
      </p>
    </Card>
  );
}
