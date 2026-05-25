/**
 * Visual tokens + small formatters shared across the work-items UI.
 *
 * All colors come from Tailwind palette tokens that have *real* light/dark
 * variants — we intentionally use the named palette here (rose/amber/emerald
 * etc) instead of theme tokens because each status & priority needs its own
 * unique tint that the global theme tokens don't provide.
 */

import { CheckCircle2, AlertOctagon, XCircle } from "lucide-react";
import type {
  Priority,
  Status,
  SubmissionKind,
  WorkItemRow,
} from "./types";

export const PRIORITY_META: Record<
  Priority,
  { label: string; chip: string; dot: string; weight: number }
> = {
  high: {
    label: "High",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
    dot: "bg-rose-500",
    weight: 3,
  },
  medium: {
    label: "Medium",
    chip: "bg-amber-400/10 text-amber-800 dark:text-amber-200 border-amber-500/25",
    dot: "bg-amber-500",
    weight: 2,
  },
  low: {
    label: "Low",
    chip: "bg-muted/60 text-muted-foreground border-border/60",
    dot: "bg-muted-foreground/60",
    weight: 1,
  },
};

export const STATUS_META: Record<
  Status,
  { label: string; chip: string; column: string; node: string; weight: number }
> = {
  open: {
    label: "Open",
    chip: "bg-primary/10 text-primary border-primary/25",
    column: "from-primary/20 to-transparent",
    node: "bg-primary/20 text-primary",
    weight: 1,
  },
  in_progress: {
    label: "In progress",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
    column: "from-sky-500/20 to-transparent",
    node: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    weight: 2,
  },
  blocked: {
    label: "Blocked",
    chip: "bg-amber-400/10 text-amber-800 dark:text-amber-200 border-amber-500/25",
    column: "from-amber-400/20 to-transparent",
    node: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    weight: 3,
  },
  done: {
    label: "Done",
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
    column: "from-violet-500/20 to-transparent",
    node: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    weight: 4,
  },
};

export const SUBMISSION_META: Record<
  SubmissionKind,
  { label: string; tone: string; ring: string; Icon: typeof CheckCircle2 }
> = {
  done: {
    label: "Done",
    tone: "text-violet-700 dark:text-violet-300",
    ring: "border-violet-500/25 bg-violet-500/[0.06] dark:bg-violet-500/[0.08]",
    Icon: CheckCircle2,
  },
  blocked: {
    label: "Blocked",
    tone: "text-amber-800 dark:text-amber-200",
    ring: "border-amber-500/25 bg-amber-400/[0.06] dark:bg-amber-500/[0.08]",
    Icon: AlertOctagon,
  },
  wont_do: {
    label: "Won't do",
    tone: "text-rose-700 dark:text-rose-300",
    ring: "border-rose-500/25 bg-rose-500/[0.06] dark:bg-rose-500/[0.08]",
    Icon: XCircle,
  },
};

/** 10 deterministic tag colors, picked by tag-name hash. */
const TAG_PALETTE = [
  "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
  "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
  "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
  "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
  "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25",
  "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/25",
  "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/25",
  "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25",
];

export function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

export const STATUS_ORDER: Status[] = ["open", "in_progress", "blocked", "done"];
export const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];
export const POINTS_OPTIONS = [1, 2, 3, 5, 8, 13];

export function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function dueState(
  iso: string | null,
): { label: string; tone: string; overdue: boolean } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (days < 0)
    return {
      label: `Overdue · ${Math.abs(days)}d`,
      tone: "text-danger",
      overdue: true,
    };
  if (days === 0) return { label: "Due today", tone: "text-warning", overdue: false };
  if (days === 1) return { label: "Due tomorrow", tone: "text-warning", overdue: false };
  if (days < 7)
    return { label: `Due in ${days}d`, tone: "text-muted-foreground", overdue: false };
  return {
    label: new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    tone: "text-muted-foreground",
    overdue: false,
  };
}

export function subtaskProgress(row: WorkItemRow): {
  done: number;
  total: number;
  pct: number;
} {
  const total = row.subtasks?.length ?? 0;
  const done = (row.subtasks ?? []).filter((s) => s.done).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function compareForOrder(a: WorkItemRow, b: WorkItemRow): number {
  if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
  if (a.order !== b.order) return a.order - b.order;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
