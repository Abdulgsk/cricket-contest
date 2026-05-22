"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitBugResolutionAction } from "@/actions/bugs";

export function MyBugResolveForm({ id }: { id: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs text-success">
        Marked as resolved. Refresh to see it move to your closed list.
      </div>
    );
  }

  const submit = () => {
    if (note.trim().length < 3) {
      toast.error("Add a short note describing your fix.");
      return;
    }
    start(async () => {
      const res = await submitBugResolutionAction({ id, resolutionNote: note.trim() });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to submit");
        return;
      }
      toast.success("Resolution submitted");
      setDone(true);
    });
  };

  return (
    <div className="border-t border-border/40 pt-2.5 space-y-2">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Resolution note
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="What did you do to fix it? Steps, commit hash, anything useful…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y"
        maxLength={4000}
        disabled={pending}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} loading={pending} disabled={note.trim().length < 3}>
          Submit & mark resolved
        </Button>
      </div>
    </div>
  );
}
