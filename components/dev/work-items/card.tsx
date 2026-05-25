/**
 * Compact work-item card used by the List and Board views. Optimised to fit
 * a kanban column at ~320px wide while still showing every signal: tags,
 * subtask progress, attachment / comment counts, watchers, story points,
 * due-date pill (red when overdue), priority chip and assignee avatar.
 *
 * Selection checkbox sits in the top-left and is keyboard accessible. The
 * whole card is clickable to open the detail drawer; the checkbox stops
 * propagation so multi-select works inline.
 */

"use client";

import {
  Clock,
  Paperclip,
  MessageSquare,
  CheckSquare,
  Eye,
  CalendarDays,
  AlertOctagon,
} from "lucide-react";
import {
  PRIORITY_META,
  STATUS_META,
  tagColor,
  dueState,
  subtaskProgress,
  relTime,
} from "./util";
import type { WorkItemRow } from "./types";

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-grid place-items-center rounded-full bg-primary/15 text-primary font-semibold shrink-0 ring-2 ring-card"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}

export function WorkItemCard({
  row,
  selected,
  selectable,
  onSelectChange,
  onOpen,
  compact = false,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  row: WorkItemRow;
  selected: boolean;
  selectable: boolean;
  onSelectChange: (id: string, next: boolean) => void;
  onOpen: (id: string) => void;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  const pri = PRIORITY_META[row.priority];
  const stat = STATUS_META[row.status];
  const due = dueState(row.dueAt);
  const sub = subtaskProgress(row);
  const commentCount = (row.activity ?? []).filter(
    (a) => a.kind === "comment" && !a.deletedAt,
  ).length;
  const attachCount = row.attachments?.length ?? 0;
  const inReview = row.needsReview && row.submission;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row.id);
        }
      }}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.id);
        onDragStart?.(row.id);
      }}
      onDragEnd={() => onDragEnd?.()}
      data-selected={selected || undefined}
      className={
        "group relative rounded-2xl border bg-card text-left shadow-sm transition cursor-pointer " +
        "hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 " +
        (selected
          ? "border-primary/60 ring-2 ring-primary/30"
          : "border-border/60") +
        (compact ? " p-2.5" : " p-3")
      }
    >
      {/* Accent stripe for review state */}
      {inReview && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-amber-400/40 via-amber-500/70 to-amber-400/40"
        />
      )}

      {/* Header row: select + priority + assignee */}
      <header className="flex items-center gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSelectChange(row.id, e.target.checked)}
            aria-label={selected ? "Deselect" : "Select"}
            className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
          />
        )}
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${pri.chip}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${pri.dot}`} />
          {pri.label}
        </span>
        {inReview && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:text-amber-200">
            <Clock className="h-2.5 w-2.5" />
            Review
          </span>
        )}
        {typeof row.storyPoints === "number" && (
          <span className="ml-auto rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground tabular-nums">
            {row.storyPoints} pts
          </span>
        )}
        <Avatar
          name={row.assignedToName}
          size={20}
        />
      </header>

      {/* Title */}
      <h3
        className={
          "mt-1.5 font-semibold leading-snug text-foreground break-words " +
          (compact ? "text-[13px] line-clamp-2" : "text-sm line-clamp-3")
        }
      >
        {row.title}
      </h3>

      {/* Tags */}
      {row.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {row.tags.slice(0, compact ? 3 : 5).map((t) => (
            <span
              key={t}
              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${tagColor(t)}`}
            >
              {t}
            </span>
          ))}
          {row.tags.length > (compact ? 3 : 5) && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
              +{row.tags.length - (compact ? 3 : 5)}
            </span>
          )}
        </div>
      )}

      {/* Subtask progress */}
      {sub.total > 0 && (
        <div className="mt-2 space-y-0.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              {sub.done} / {sub.total}
            </span>
            <span className="tabular-nums">{sub.pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${sub.pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer: due + counts */}
      <footer className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        {due ? (
          <span className={`inline-flex items-center gap-1 ${due.tone}`}>
            {due.overdue ? (
              <AlertOctagon className="h-3 w-3" />
            ) : (
              <CalendarDays className="h-3 w-3" />
            )}
            {due.label}
          </span>
        ) : (
          <span className="text-muted-foreground/60">No due date</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Comments">
              <MessageSquare className="h-3 w-3" />
              {commentCount}
            </span>
          )}
          {attachCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Attachments">
              <Paperclip className="h-3 w-3" />
              {attachCount}
            </span>
          )}
          {row.watcherCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Watchers">
              <Eye className="h-3 w-3" />
              {row.watcherCount}
            </span>
          )}
        </span>
      </footer>

      {/* Status hint (used by List view only). Board view hides via prop. */}
      {!compact && (
        <div
          className="mt-2 flex items-center justify-between gap-2 border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground"
          title={`Updated ${relTime(row.createdAt)}`}
        >
          <span
            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${stat.chip}`}
          >
            {stat.label}
          </span>
          <span suppressHydrationWarning>
            by {row.createdByName} · {relTime(row.createdAt)}
          </span>
        </div>
      )}
    </article>
  );
}
