"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { regenerateLatestFactsAction } from "@/actions/admin";

export function RegenerateFactsButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await regenerateLatestFactsAction();
          if (r.ok) {
            toast.success(`New facts generated for ${r.matchLabel}`);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      📰 Regenerate today&apos;s facts
    </Button>
  );
}
