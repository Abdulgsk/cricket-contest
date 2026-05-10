"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { setAnnouncementAction } from "@/actions/admin";

export function SettingsForms({ announcement }: { announcement: string }) {
  const [text, setText] = useState(announcement);
  const [pending, start] = useTransition();

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
    </div>
  );
}
