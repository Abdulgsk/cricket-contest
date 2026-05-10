"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { setAnnouncementAction } from "@/actions/admin";

export function SettingsForms({
  announcement,
}: {
  announcement: string;
}) {
  const [text, setText] = useState(announcement);
  const [pending, start] = useTransition();
  const [my11Status, setMy11Status] = useState<"unknown" | "logged-in" | "logged-out">("unknown");

  const checkMy11Status = () =>
    start(async () => {
      try {
        const res = await fetch("/api/admin/my11-mini-browser", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "sessionStatus" }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          data?: { loggedIn?: boolean };
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to check mini-browser status");
        }
        const loggedIn = Boolean(data.data?.loggedIn);
        setMy11Status(loggedIn ? "logged-in" : "logged-out");
        toast.success(loggedIn ? "Mini-browser is logged in" : "Mini-browser is not logged in");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to check mini-browser status");
      }
    });

  const startMy11Login = () =>
    start(async () => {
      try {
        const res = await fetch("/api/admin/my11-mini-browser", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "startLogin" }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to start My11 login");
        }
        setMy11Status("logged-out");
        toast.success("My11 login window opened. Complete phone + OTP there, then click Check status.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to start My11 login");
      }
    });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Announcement</Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              await setAnnouncementAction(text);
              toast.success("Announcement updated");
            })
          }
        >
          Save announcement
        </Button>
      </div>

      <div className="space-y-2 border border-border/50 rounded-xl p-3">
        <Label>My11 Mini-Browser Login</Label>
        <p className="text-xs text-muted-foreground">
          Start login to open My11 in the mini-browser process. Complete phone + OTP there, then
          check status.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={pending} onClick={startMy11Login}>
            Start My11 Login
          </Button>
          <Button variant="outline" loading={pending} onClick={checkMy11Status}>
            Check Session Status
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Session: {my11Status === "unknown" ? "unknown" : my11Status === "logged-in" ? "logged in" : "logged out"}
        </p>
      </div>
    </div>
  );
}
