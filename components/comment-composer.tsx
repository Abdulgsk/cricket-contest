"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Generic comment composer. Caller supplies the server action (which must
 * accept `{ id, text }`) and the parent id. Used for both bugs and work items.
 */
export function CommentComposer({
  id,
  onSend,
  placeholder = "Reply to the thread… (Enter to send, Shift+Enter for newline)",
  compact = false,
}: {
  id: string;
  onSend: (input: { id: string; text: string }) => Promise<{ ok: boolean; error?: string }>;
  placeholder?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed.length < 1) return;
    start(async () => {
      const res = await onSend({ id, text: trimmed });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't post comment");
        return;
      }
      setText("");
    });
  };

  return (
    <div
      className={
        "flex items-end gap-2 " +
        (compact ? "" : "rounded-2xl border border-border/60 bg-card/40 p-2")
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={compact ? 1 : 2}
        maxLength={4000}
        disabled={pending}
        placeholder={placeholder}
        className="flex-1 min-h-[2.25rem] resize-none rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={pending || text.trim().length < 1}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
