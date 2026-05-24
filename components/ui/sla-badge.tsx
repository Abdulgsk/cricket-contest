"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Clock, AlarmClock, CalendarCheck } from "lucide-react";
import { formatDueRelative } from "@/lib/bug-format";

/**
 * SLA / due chip. Tone shifts as the deadline approaches and goes red after.
 */
export function SlaBadge({
  dueAt,
  className,
  size = "sm",
}: {
  dueAt: string | Date | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = formatDueRelative(dueAt ?? null);
  if (!meta) return null;
  const toneMap = {
    muted: "bg-muted/70 text-muted-foreground border-border/60",
    ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    warn: "bg-amber-400/10 text-amber-800 dark:text-amber-200 border-amber-500/30",
    danger: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 animate-pulse",
  } as const;
  const Icon = meta.overdue ? AlarmClock : meta.tone === "muted" ? CalendarCheck : Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]",
        toneMap[meta.tone],
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

/** Age chip: when an open/in-progress bug has been around for >N days. */
export function AgeBadge({
  createdAt,
  status,
  className,
}: {
  createdAt: string | Date;
  status: "open" | "in_progress" | "resolved" | "wont_fix";
  className?: string;
}) {
  if (status === "resolved" || status === "wont_fix") return null;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 3) return null;
  const tone =
    days >= 14
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
      : days >= 7
        ? "bg-amber-400/10 text-amber-800 dark:text-amber-200 border-amber-500/30"
        : "bg-muted/70 text-muted-foreground border-border/60";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
        tone,
        className,
      )}
    >
      <Clock className="h-3 w-3" />
      {days}d old
    </span>
  );
}
