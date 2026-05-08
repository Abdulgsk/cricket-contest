"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { setAnnouncementAction, setBountyAction } from "@/actions/admin";

export function SettingsForms({
  announcement,
  bountyHolder,
  users,
}: {
  announcement: string;
  bountyHolder: string;
  users: { id: string; name: string; handle: string }[];
}) {
  const [text, setText] = useState(announcement);
  const [bounty, setBounty] = useState(bountyHolder);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Announcement</Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        <Button
          disabled={pending}
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

      <div className="space-y-2">
        <Label>Bounty holder (next player to beat them gets +3)</Label>
        <select
          className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
          value={bounty}
          onChange={(e) => setBounty(e.target.value)}
        >
          <option value="">— No bounty —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} (@{u.handle})</option>
          ))}
        </select>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setBountyAction(bounty || null);
              toast.success("Bounty updated");
            })
          }
        >
          Save bounty
        </Button>
      </div>
    </div>
  );
}
