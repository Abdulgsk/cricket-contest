"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Megaphone, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Inline "Request changes" composer. Mandatory note (3+ chars). Caller
 * supplies the server action and the parent id. Used for both bugs and work
 * items.
 */
export function RequestChangesDialog({
  id,
  onSubmit,
  onDone,
  onCancel,
}: {
  id: string;
  onSubmit: (input: { id: string; note: string }) => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const send = () => {
    const trimmed = note.trim();
    if (trimmed.length < 3) {
      toast.error("Add a short note (3+ chars).");
      return;
    }
    start(async () => {
      const res = await onSubmit({ id, note: trimmed });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't send");
        return;
      }
      toast.success("Sent back to assignee");
      setNote("");
      onDone?.();
    });
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
        <Megaphone className="h-3.5 w-3.5" />
        Request changes
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={4000}
        autoFocus
        placeholder="What needs to change before this can close? Be specific."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        disabled={pending}
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={send} disabled={pending || note.trim().length < 3}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : null}
          Send back to assignee
        </Button>
      </div>
    </div>
  );
}
