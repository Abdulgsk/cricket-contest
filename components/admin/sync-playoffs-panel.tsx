"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { syncPlayoffsAction } from "@/actions/admin";

export function SyncPlayoffsPanel() {
  const [pending, start] = useTransition();
  return (
    <Card className="border-warning/40">
      <h2 className="font-semibold mb-2">🏆 Playoffs Sync (Super-admin only)</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Pulls Qualifier 1, Eliminator, Qualifier 2 and Final fixtures (teams will show as TBD until
        the league stage completes).
      </p>
      <Button
        variant="outline"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await syncPlayoffsAction();
            if (r.ok) toast.success(`Synced · ${r.created} new · ${r.updated} updated`);
            else toast.error(r.error);
          })
        }
      >
        {pending ? "Syncing playoffs…" : "Add Qualifiers / Eliminator / Final"}
      </Button>
    </Card>
  );
}
