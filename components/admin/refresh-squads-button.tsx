"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshSquadsAction } from "@/actions/admin";

export function RefreshSquadsButton({ matchId }: { matchId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshSquadsAction(matchId);
          if (r.ok) toast.success(`Squads refreshed · A:${r.squadA} B:${r.squadB}`);
          else toast.error(r.error);
        })
      }
    >
      {pending ? "Refreshing…" : "🔄 Refresh squads"}
    </Button>
  );
}
