"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function callJson(url: string, method: "GET" | "POST" = "GET") {
  const res = await fetch(url, { method, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Request failed");
  }
  return data as Record<string, unknown>;
}

export function AutomationTools() {
  const [pending, start] = useTransition();
  const [matchId, setMatchId] = useState("");

  const runStatusRefresh = () =>
    start(async () => {
      try {
        const data = await callJson("/api/admin/update-statuses");
        const status = (data.status ?? {}) as {
          upcomingToLive?: number;
          liveToCompleted?: number;
        };
        toast.success(
          `Status updated · upcoming→live ${status.upcomingToLive ?? 0} · live→completed ${status.liveToCompleted ?? 0}`
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update statuses");
      }
    });

  const runFixtureSync = () =>
    start(async () => {
      try {
        const data = await callJson("/api/admin/sync-fixtures");
        const sync = (data.sync ?? {}) as {
          created?: number;
          updated?: number;
          season?: string;
        };
        toast.success(
          `Fixtures synced · ${sync.created ?? 0} new · ${sync.updated ?? 0} updated · season ${sync.season ?? "-"}`
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to sync fixtures");
      }
    });

  const forceComplete = () =>
    start(async () => {
      const id = matchId.trim();
      if (!id) {
        toast.error("Enter a match ID first");
        return;
      }
      try {
        await callJson(`/api/admin/matches/${encodeURIComponent(id)}/force-complete`, "POST");
        toast.success("Match marked completed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to force complete match");
      }
    });

  return (
    <Card>
      <h2 className="font-semibold mb-2">Automation Tools</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Run operational automations on demand from admin.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" loading={pending} onClick={runStatusRefresh}>
          Refresh Match Statuses
        </Button>
        <Button variant="glow" loading={pending} onClick={runFixtureSync}>
          Sync Fixtures Now
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          placeholder="Match ID for force complete"
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
        />
        <Button variant="outline" loading={pending} onClick={forceComplete}>
          Force Complete
        </Button>
      </div>
    </Card>
  );
}
