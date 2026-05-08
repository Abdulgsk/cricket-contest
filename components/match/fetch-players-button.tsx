"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshMatchPlayersAction } from "@/actions/admin";

export function FetchPlayersButton({ matchId }: { matchId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshMatchPlayersAction(matchId);
          if (r.ok) toast.success(`Fetched ${r.players} players`);
          else toast.error(r.error);
        })
      }
    >
      {pending ? "Fetching…" : "🧑‍🤝‍🧑 Fetch players"}
    </Button>
  );
}
