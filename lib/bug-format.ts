/**
 * Pure helpers shared by every bug surface. No React, no DB.
 */

export type BugStatus = "open" | "in_progress" | "resolved" | "wont_fix";
export type Severity = "low" | "medium" | "high";
export type SubmissionKind = "fixed" | "blocked" | "wont_fix";

export const STATUS_LABEL: Record<BugStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won’t fix",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Linear-style very-compact relative time. */
export function relTime(iso: string | Date | number): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "in the future";
  const s = Math.floor(ms / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

export function relTimeLong(iso: string | Date | number): string {
  const base = relTime(iso);
  if (base === "just now") return base;
  return `${base} ago`;
}

export function formatDueRelative(iso: string | Date | null | undefined): {
  label: string;
  tone: "muted" | "ok" | "warn" | "danger";
  overdue: boolean;
} | null {
  if (!iso) return null;
  const due = new Date(iso).getTime();
  const now = Date.now();
  const diff = due - now;
  const overdue = diff < 0;
  const absH = Math.abs(diff) / (1000 * 60 * 60);
  const tone: "muted" | "ok" | "warn" | "danger" = overdue
    ? "danger"
    : absH < 24
      ? "warn"
      : absH < 72
        ? "ok"
        : "muted";
  let label: string;
  if (overdue) {
    label = `Overdue · ${relTime(iso)}`;
  } else if (absH < 1) {
    label = "Due in <1h";
  } else if (absH < 24) {
    label = `Due in ${Math.round(absH)}h`;
  } else {
    label = `Due in ${Math.round(absH / 24)}d`;
  }
  return { label, tone, overdue };
}

/** Stable HSL-ish colour from a string for avatar tinting. */
export function colorFromString(s: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    bg: `hsl(${hue} 70% 88% / 0.7)`,
    fg: `hsl(${hue} 55% 28%)`,
  };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
