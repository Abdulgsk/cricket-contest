"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Smile } from "lucide-react";
import { toast } from "sonner";
import { toggleBugReactionAction } from "@/actions/bugs";

const EMOJIS = ["👍", "❤️", "🎉", "👀", "🚀", "🙌", "😄", "🤔"];

export type ReactionMap = Record<
  string,
  Array<{ byHandle: string; byName: string; byId: string }>
>;

export function ReactionsBar({
  bugId,
  activityId,
  reactions,
  myUserId,
  compact,
  className,
}: {
  bugId: string;
  activityId: string;
  reactions: ReactionMap;
  myUserId: string;
  compact?: boolean;
  className?: string;
}) {
  const [optimistic, setOptimistic] = React.useState<ReactionMap>(reactions);
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const pickerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => setOptimistic(reactions), [reactions]);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (emoji: string) => {
    const current = optimistic[emoji] ?? [];
    const mine = current.find((r) => r.byId === myUserId);
    const next = { ...optimistic };
    if (mine) {
      next[emoji] = current.filter((r) => r.byId !== myUserId);
      if (next[emoji].length === 0) delete next[emoji];
    } else {
      next[emoji] = [
        ...current,
        { byId: myUserId, byHandle: "you", byName: "You" },
      ];
    }
    setOptimistic(next);
    setOpen(false);
    start(async () => {
      const r = await toggleBugReactionAction({ bugId, activityId, emoji });
      if (!r.ok) {
        setOptimistic(reactions);
        toast.error(r.error ?? "Reaction failed");
      }
    });
  };

  const entries = Object.entries(optimistic).filter(([, v]) => v.length > 0);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {entries.map(([emoji, list]) => {
        const mine = list.some((r) => r.byId === myUserId);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            disabled={pending}
            title={list.map((r) => r.byName).join(", ")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] leading-none transition",
              mine
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-muted/50 text-foreground/80 hover:bg-muted",
            )}
          >
            <span>{emoji}</span>
            <span className="text-[10.5px] font-semibold tabular-nums">
              {list.length}
            </span>
          </button>
        );
      })}

      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-muted-foreground transition hover:text-foreground hover:bg-muted",
            compact ? "h-6" : "h-7",
          )}
          aria-label="Add reaction"
        >
          <Smile className="h-3.5 w-3.5" />
          {!compact && entries.length === 0 ? (
            <span className="text-[11px]">React</span>
          ) : null}
        </button>
        {open ? (
          <div
            role="menu"
            className="absolute bottom-full left-0 z-30 mb-1 flex gap-0.5 rounded-2xl border border-border bg-popover px-2 py-1.5 shadow-xl backdrop-blur"
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggle(e)}
                className="grid h-8 w-8 place-items-center rounded-lg text-base transition hover:scale-110 hover:bg-muted"
                aria-label={`React with ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Group raw reaction array by emoji for the bar. */
export function groupReactions(
  list: Array<{ emoji: string; byId: string; byHandle: string; byName: string }>,
): ReactionMap {
  const out: ReactionMap = {};
  for (const r of list ?? []) {
    if (!out[r.emoji]) out[r.emoji] = [];
    out[r.emoji].push({ byId: r.byId, byHandle: r.byHandle, byName: r.byName });
  }
  return out;
}
