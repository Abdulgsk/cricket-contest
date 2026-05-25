/**
 * Five views over the same `rows` array.
 *
 * - List: comfortable vertical stack of full cards.
 * - Board: 4 status columns with HTML5 drag/drop.
 * - Table: dense sortable table with full keyboard nav.
 * - Calendar: month grid keyed by `dueAt`.
 * - Mine: grouped by status for one assignee.
 *
 * Each view receives the same callbacks so the parent owns the state.
 */

"use client";

import { useMemo, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Paperclip,
  MessageSquare,
  Clock,
  CalendarDays,
  AlertOctagon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { WorkItemCard } from "./card";
import {
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
  compareForOrder,
  dueState,
  subtaskProgress,
  tagColor,
} from "./util";
import type { Status, WorkItemRow } from "./types";

/* -------------------------------------------------------------------------- */
/*  Shared empty state                                                         */
/* -------------------------------------------------------------------------- */

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-4 py-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  List                                                                       */
/* -------------------------------------------------------------------------- */

export function ListView({
  rows,
  selection,
  onSelectChange,
  onOpen,
}: {
  rows: WorkItemRow[];
  selection: Set<string>;
  onSelectChange: (id: string, next: boolean) => void;
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return <EmptyState label="Nothing matches this view." />;
  return (
    <div className="space-y-2.5">
      {[...rows].sort(compareForOrder).map((r) => (
        <WorkItemCard
          key={r.id}
          row={r}
          selectable
          selected={selection.has(r.id)}
          onSelectChange={onSelectChange}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Board (Kanban)                                                             */
/* -------------------------------------------------------------------------- */

export function BoardView({
  rows,
  selection,
  onSelectChange,
  onOpen,
  onReorder,
  canManage,
}: {
  rows: WorkItemRow[];
  selection: Set<string>;
  onSelectChange: (id: string, next: boolean) => void;
  onOpen: (id: string) => void;
  onReorder: (movedId: string, toStatus: Status, siblings: string[]) => void;
  canManage: boolean;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);

  const byStatus: Record<Status, WorkItemRow[]> = {
    open: [],
    in_progress: [],
    blocked: [],
    done: [],
  };
  for (const r of rows) byStatus[r.status]?.push(r);
  for (const k of STATUS_ORDER) byStatus[k].sort(compareForOrder);

  const handleDrop = (toStatus: Status) => {
    if (!dragging) return;
    setDragOver(null);
    const moved = rows.find((r) => r.id === dragging);
    setDragging(null);
    if (!moved) return;
    // Build new siblings list for the destination column.
    const dest = byStatus[toStatus].filter((r) => r.id !== dragging);
    const next = [moved, ...dest]; // newly-dropped goes to top; user can reorder later
    onReorder(dragging, toStatus, next.map((r) => r.id));
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {STATUS_ORDER.map((s) => {
        const meta = STATUS_META[s];
        const items = byStatus[s];
        const isOver = dragOver === s;
        return (
          <section
            key={s}
            onDragOver={(e) => {
              if (!canManage) return;
              e.preventDefault();
              setDragOver(s);
            }}
            onDragLeave={() => setDragOver((curr) => (curr === s ? null : curr))}
            onDrop={(e) => {
              if (!canManage) return;
              e.preventDefault();
              handleDrop(s);
            }}
            className={
              "flex min-h-[200px] flex-col rounded-2xl border bg-card/30 transition " +
              (isOver ? "border-primary/60 ring-2 ring-primary/20" : "border-border/60")
            }
          >
            <header
              className={`relative rounded-t-2xl bg-gradient-to-b ${meta.column} px-3 py-2`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-grid place-items-center h-5 w-5 rounded-full ${meta.node} text-[10px] font-bold`}
                  >
                    {items.length}
                  </span>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                    {meta.label}
                  </h3>
                </div>
              </div>
            </header>
            <div className="flex-1 space-y-2 p-2">
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/40 px-3 py-6 text-center text-[11px] text-muted-foreground">
                  {canManage ? "Drop here" : "Empty"}
                </div>
              ) : (
                items.map((r) => (
                  <WorkItemCard
                    key={r.id}
                    row={r}
                    compact
                    selectable
                    selected={selection.has(r.id)}
                    onSelectChange={onSelectChange}
                    onOpen={onOpen}
                    draggable={canManage}
                    onDragStart={(id) => setDragging(id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDragOver(null);
                    }}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Table                                                                      */
/* -------------------------------------------------------------------------- */

type SortKey =
  | "title"
  | "status"
  | "priority"
  | "assignee"
  | "due"
  | "points"
  | "created";

export function TableView({
  rows,
  selection,
  onSelectChange,
  onOpen,
}: {
  rows: WorkItemRow[];
  selection: Set<string>;
  onSelectChange: (id: string, next: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "created",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const cp = [...rows];
    cp.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "status":
          return (STATUS_META[a.status].weight - STATUS_META[b.status].weight) * dir;
        case "priority":
          return (
            (PRIORITY_META[a.priority].weight - PRIORITY_META[b.priority].weight) * dir
          );
        case "assignee":
          return a.assignedToName.localeCompare(b.assignedToName) * dir;
        case "due": {
          const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
          return (ad - bd) * dir;
        }
        case "points":
          return ((a.storyPoints ?? -1) - (b.storyPoints ?? -1)) * dir;
        case "created":
        default:
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
          );
      }
    });
    return cp;
  }, [rows, sort]);

  if (rows.length === 0) return <EmptyState label="Nothing matches this view." />;

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  const Th = ({ k, label, align }: { k: SortKey; label: string; align?: string }) => (
    <th
      onClick={() => toggleSort(k)}
      className={
        "cursor-pointer select-none px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground " +
        (align ?? "text-left")
      }
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.key === k ? (
          sort.dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </span>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40">
      <table className="w-full min-w-[800px] border-separate border-spacing-0">
        <thead className="bg-muted/20">
          <tr>
            <th className="w-8 px-2 py-2"></th>
            <Th k="title" label="Title" />
            <Th k="status" label="Status" />
            <Th k="priority" label="Priority" />
            <Th k="assignee" label="Assignee" />
            <Th k="due" label="Due" />
            <Th k="points" label="Pts" align="text-right" />
            <Th k="created" label="Created" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const due = dueState(r.dueAt);
            const sub = subtaskProgress(r);
            const stat = STATUS_META[r.status];
            const pri = PRIORITY_META[r.priority];
            const isSel = selection.has(r.id);
            return (
              <tr
                key={r.id}
                onClick={() => onOpen(r.id)}
                className={
                  "cursor-pointer transition " +
                  (isSel
                    ? "bg-primary/10"
                    : i % 2 === 0
                      ? "bg-transparent hover:bg-muted/30"
                      : "bg-muted/10 hover:bg-muted/30")
                }
              >
                <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={(e) => onSelectChange(r.id, e.target.checked)}
                    aria-label="Select"
                    className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                  />
                </td>
                <td className="px-2 py-2 text-sm">
                  <div className="font-medium text-foreground line-clamp-1">{r.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {r.needsReview && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-800 dark:text-amber-200">
                        <Clock className="h-2.5 w-2.5" />
                        Review
                      </span>
                    )}
                    {sub.total > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <CheckSquare className="h-3 w-3" />
                        {sub.done}/{sub.total}
                      </span>
                    )}
                    {(r.activity ?? []).filter(
                      (a) => a.kind === "comment" && !a.deletedAt,
                    ).length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {
                          (r.activity ?? []).filter(
                            (a) => a.kind === "comment" && !a.deletedAt,
                          ).length
                        }
                      </span>
                    )}
                    {(r.attachments?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {r.attachments.length}
                      </span>
                    )}
                    {r.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${tagColor(t)}`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${stat.chip}`}
                  >
                    {stat.label}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${pri.chip}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${pri.dot}`} />
                    {pri.label}
                  </span>
                </td>
                <td className="px-2 py-2 text-[11px] text-foreground/80">
                  {r.assignedToName}
                </td>
                <td className="px-2 py-2 text-[11px]">
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
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-[11px] tabular-nums text-muted-foreground">
                  {typeof r.storyPoints === "number" ? r.storyPoints : "—"}
                </td>
                <td
                  className="px-2 py-2 text-[11px] text-muted-foreground"
                  suppressHydrationWarning
                >
                  {new Date(r.createdAt).toLocaleDateString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Calendar                                                                   */
/* -------------------------------------------------------------------------- */

export function CalendarView({
  rows,
  onOpen,
}: {
  rows: WorkItemRow[];
  onOpen: (id: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  // Build 6-week grid starting from Monday.
  const grid = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const dayOfWeek = (first.getDay() + 6) % 7; // 0 = Mon
    const start = new Date(first);
    start.setDate(first.getDate() - dayOfWeek);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      d.setHours(0, 0, 0, 0);
      cells.push(d);
    }
    return cells;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, WorkItemRow[]>();
    for (const r of rows) {
      if (!r.dueAt) continue;
      const d = new Date(r.dueAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  const undated = rows.filter((r) => !r.dueAt);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card/40 p-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setCursor((c) =>
                c.month === 0
                  ? { year: c.year - 1, month: 11 }
                  : { ...c, month: c.month - 1 },
              )
            }
            className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 hover:bg-muted/40"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              setCursor({ year: today.getFullYear(), month: today.getMonth() })
            }
            className="rounded-lg border border-border/60 px-2.5 h-8 text-xs hover:bg-muted/40"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() =>
              setCursor((c) =>
                c.month === 11
                  ? { year: c.year + 1, month: 0 }
                  : { ...c, month: c.month + 1 },
              )
            }
            className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 hover:bg-muted/40"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="text-sm font-semibold">{monthLabel}</div>
        <div className="text-[11px] text-muted-foreground">
          {rows.filter((r) => r.dueAt).length} dated · {undated.length} undated
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-border/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((d, i) => {
              const key = d.toISOString();
              const items = byDay.get(key) ?? [];
              const isInMonth = d.getMonth() === cursor.month;
              const isToday = d.getTime() === today.getTime();
              return (
                <div
                  key={i}
                  className={
                    "min-h-[88px] border-b border-r border-border/40 p-1 text-[10px] " +
                    (isInMonth ? "bg-transparent" : "bg-muted/10 text-muted-foreground/60")
                  }
                >
                  <div
                    className={
                      "mb-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-semibold " +
                      (isToday
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground")
                    }
                  >
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((r) => {
                      const overdue =
                        new Date(r.dueAt!).getTime() < today.getTime() &&
                        r.status !== "done";
                      const pri = PRIORITY_META[r.priority];
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => onOpen(r.id)}
                          className={
                            "block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] hover:bg-muted/40 " +
                            (overdue
                              ? "border-danger/40 bg-danger/5 text-danger"
                              : `${pri.chip} border`)
                          }
                          title={r.title}
                        >
                          {r.title}
                        </button>
                      );
                    })}
                    {items.length > 3 && (
                      <div className="text-[9px] text-muted-foreground">
                        +{items.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <details className="rounded-2xl border border-border/60 bg-card/40 p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Without due date ({undated.length})
          </summary>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {undated.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="w-full rounded-xl border border-border/60 bg-card p-2 text-left text-xs hover:border-primary/40"
                >
                  <div className="font-medium">{r.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.assignedToName}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mine (grouped by status for one assignee)                                  */
/* -------------------------------------------------------------------------- */

export function MineView({
  rows,
  myUserId,
  selection,
  onSelectChange,
  onOpen,
}: {
  rows: WorkItemRow[];
  myUserId?: string;
  selection: Set<string>;
  onSelectChange: (id: string, next: boolean) => void;
  onOpen: (id: string) => void;
}) {
  if (!myUserId) {
    return <EmptyState label="Sign in to see your queue." />;
  }
  const mine = rows.filter((r) => r.assignedToId === myUserId);
  if (mine.length === 0) {
    return <EmptyState label="Nothing assigned to you. Inbox zero." />;
  }
  return (
    <div className="space-y-4">
      {STATUS_ORDER.map((s) => {
        const group = mine.filter((r) => r.status === s).sort(compareForOrder);
        if (group.length === 0) return null;
        const meta = STATUS_META[s];
        return (
          <section key={s} className="space-y-2">
            <header className="flex items-center gap-2">
              <span
                className={`inline-grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 ${meta.node} text-[10px] font-bold`}
              >
                {group.length}
              </span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                {meta.label}
              </h3>
              <span className="h-px flex-1 bg-border/40" />
            </header>
            <div className="space-y-2">
              {group.map((r) => (
                <WorkItemCard
                  key={r.id}
                  row={r}
                  selectable
                  selected={selection.has(r.id)}
                  onSelectChange={onSelectChange}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
