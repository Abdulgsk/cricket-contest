"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestReminderAction } from "@/actions/admin";

export function TestReminderButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendTestReminderAction();
          if (r.whatsappOk) {
            toast.success(`Test sent to ${r.sentTo}`);
          } else if (r.notification) {
            toast.warning(
              `In-app notification created. WhatsApp: ${r.whatsappError ?? "skipped"}`
            );
          } else {
            toast.error("Failed to send test reminder");
          }
        })
      }
    >
      {pending ? "Sending…" : "🔔 Send test reminder"}
    </Button>
  );
}
