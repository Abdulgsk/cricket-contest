"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { syncIplMatchesAction } from "@/actions/admin";

export function SyncIplPanel() {
  const [pending, start] = useTransition();
  return (
    <Card>
      <h2 className="font-semibold mb-2">🏏 IPL Auto-Import</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Pulls upcoming IPL matches from Sportskeeda&apos;s schedule (no API key needed). Idempotent —
        safe to re-run. Squads can be refreshed per-match closer to start time.
      </p>
      <Button
        variant="glow"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await syncIplMatchesAction();
            if (r.ok)
              toast.success(
                `Synced · ${r.created} new · ${r.updated} updated · season ${r.season}`
              );
            else toast.error(r.error);
          })
        }
      >
        {pending ? "Syncing…" : "Sync IPL matches now"}
      </Button>
    </Card>
  );
}
