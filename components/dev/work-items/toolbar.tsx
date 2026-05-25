/**
 * Toolbar above the views: search, quick filters, advanced popover, view
 * switcher, saved views, "New" button. Owns all URL-synced filter state.
 *
 * URL parameters (all optional):
 *   ?view=list|board|table|calendar|mine
 *   ?q=search
 *   ?quick=mine|unassigned|overdue|review
 *   ?status=open,in_progress,...
 *   ?priority=high,medium,low
 *   ?tags=a,b
 *   ?assignee=<id>,<id>
 *   ?item=<id>     (drawer target — handled by panel, not toolbar)
 *
 * Saved views write {view, filters} to User.preferences.workItems.savedViews.
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronDown,
  ListChecks,
  LayoutGrid,
  Table as TableIcon,
  CalendarDays,
  Inbox,
  Filter,
  Bookmark,
  Star,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { saveWorkItemViewAction } from "@/actions/work-items";
import { CreateForm } from "./create-form";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  STATUS_META,
  STATUS_ORDER,
} from "./util";
import type {
  Filters,
  Priority,
  SavedView,
  Status,
  ViewMode,
  WorkItemAssignee,
  WorkItemRow,
} from "./types";

const VIEW_ICONS: Record<ViewMode, typeof ListChecks> = {
  list: ListChecks,
  board: LayoutGrid,
  table: TableIcon,
  calendar: CalendarDays,
  mine: Inbox,
};

const VIEW_LABELS: Record<ViewMode, string> = {
  list: "List",
  board: "Board",
  table: "Table",
  calendar: "Calendar",
  mine: "Mine",
};

const QUICK_FILTERS: Array<{ key: Filters["quick"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "overdue", label: "Overdue" },
  { key: "review", label: "Needs review" },
];

export function Toolbar({
  view,
  setView,
  filters,
  setFilters,
  resetFilters,
  rows,
  canManage,
  assignees,
  savedViews,
  countTotal,
  countShown,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  resetFilters: () => void;
  rows: WorkItemRow[];
  canManage: boolean;
  assignees: WorkItemAssignee[];
  savedViews: SavedView[];
  countTotal: number;
  countShown: number;
}) {
  const router = useRouter();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [pending, start] = useTransition();

  /** All distinct tags across rows for the tag chooser. */
  const allTags = Array.from(
    new Set(rows.flatMap((r) => r.tags)),
  ).sort();

  const persistDefault = (v: ViewMode) => {
    start(async () => {
      await saveWorkItemViewAction({ view: v });
    });
  };

  const saveCurrentAsView = () => {
    const name = newViewName.trim();
    if (!name) return;
    start(async () => {
      const res = await saveWorkItemViewAction({
        saveAs: {
          name,
          view,
          filters: filters as unknown as Record<string, unknown>,
        },
      });
      if (!res || res.ok === false) {
        toast.error(res?.error ?? "Could not save view");
        return;
      }
      toast.success(`Saved “${name}”`);
      setNewViewName("");
      setSavingView(false);
      router.refresh();
    });
  };

  const deleteSavedView = (id: string) => {
    start(async () => {
      const res = await saveWorkItemViewAction({ deleteId: id });
      if (!res || res.ok === false) {
        toast.error(res?.error ?? "Could not delete view");
        return;
      }
      router.refresh();
    });
  };

  const activeFilterCount =
    filters.status.length +
    filters.priority.length +
    filters.assigneeIds.length +
    filters.tags.length +
    (filters.search ? 1 : 0) +
    (filters.quick !== "all" ? 1 : 0);

  return (
    <div className="space-y-2">
      {/* Top row: title + counts + create */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-primary" />
          Work items
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
            {countShown === countTotal
              ? countTotal
              : `${countShown}/${countTotal}`}
          </span>
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          {/* Saved views */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSavedOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2.5 h-9 text-xs hover:bg-muted/40"
            >
              <Bookmark className="h-3.5 w-3.5" />
              Views
              {savedViews.length > 0 && (
                <span className="ml-0.5 rounded-full bg-muted px-1 text-[9px] tabular-nums text-muted-foreground">
                  {savedViews.length}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </button>
            {savedOpen && (
              <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-border bg-card p-2 shadow-xl">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Saved views
                </div>
                {savedViews.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-muted-foreground/60">
                    No saved views yet.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {savedViews.map((sv) => {
                      const Icon = VIEW_ICONS[sv.view];
                      return (
                        <li
                          key={sv.id}
                          className="flex items-center gap-1 rounded-md hover:bg-muted/30"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setView(sv.view);
                              setFilters({
                                ...(sv.filters as unknown as Filters),
                              });
                              setSavedOpen(false);
                            }}
                            className="flex flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs"
                          >
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate">{sv.name}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSavedView(sv.id)}
                            disabled={pending}
                            className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-danger"
                            aria-label="Delete saved view"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="my-2 h-px bg-border/60" />
                {savingView ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newViewName}
                      onChange={(e) => setNewViewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveCurrentAsView();
                        if (e.key === "Escape") setSavingView(false);
                      }}
                      placeholder="View name"
                      maxLength={60}
                      className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={saveCurrentAsView}
                      disabled={pending}
                      className="rounded-md border border-primary/30 bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25"
                    >
                      {pending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSavingView(true)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  >
                    <Star className="h-3.5 w-3.5" />
                    Save current as new view
                  </button>
                )}
              </div>
            )}
          </div>
          {canManage && <CreateForm assignees={assignees} />}
        </div>
      </div>

      {/* Search + view switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search title, description, tags…  (press / to focus)"
            className="w-full rounded-lg border border-border bg-background pl-7 pr-7 h-9 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            data-wi-search
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters({ ...filters, search: "" })}
              className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded hover:bg-muted/40"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/50 p-0.5">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => {
            const Icon = VIEW_ICONS[v];
            const active = v === view;
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  persistDefault(v);
                }}
                title={VIEW_LABELS[v]}
                className={
                  "inline-flex items-center gap-1 rounded-md px-2 h-8 text-[11px] font-medium transition " +
                  (active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{VIEW_LABELS[v]}</span>
              </button>
            );
          })}
        </div>

        {/* Advanced */}
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className={
            "inline-flex items-center gap-1 rounded-lg border px-2.5 h-9 text-xs " +
            (advancedOpen || activeFilterCount > 0
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/60 bg-background/50 hover:bg-muted/40")
          }
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary/20 px-1 text-[9px] tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      {/* Quick filter pills */}
      <div className="flex flex-wrap items-center gap-1">
        {QUICK_FILTERS.map((q) => (
          <button
            key={q.key}
            type="button"
            onClick={() => setFilters({ ...filters, quick: q.key })}
            className={
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition " +
              (filters.quick === q.key
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:bg-muted/30 hover:text-foreground")
            }
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Advanced panel */}
      {advancedOpen && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-3 space-y-3">
          <FilterRow label="Status">
            {STATUS_ORDER.map((s) => {
              const active = filters.status.includes(s);
              return (
                <ToggleChip
                  key={s}
                  active={active}
                  className={active ? STATUS_META[s].chip : ""}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      status: active
                        ? filters.status.filter((x) => x !== s)
                        : ([...filters.status, s] as Status[]),
                    })
                  }
                >
                  {STATUS_META[s].label}
                </ToggleChip>
              );
            })}
          </FilterRow>

          <FilterRow label="Priority">
            {PRIORITY_ORDER.map((p) => {
              const active = filters.priority.includes(p);
              return (
                <ToggleChip
                  key={p}
                  active={active}
                  className={active ? PRIORITY_META[p].chip : ""}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      priority: active
                        ? filters.priority.filter((x) => x !== p)
                        : ([...filters.priority, p] as Priority[]),
                    })
                  }
                >
                  {PRIORITY_META[p].label}
                </ToggleChip>
              );
            })}
          </FilterRow>

          <FilterRow label="Assignee">
            {assignees.map((a) => {
              const active = filters.assigneeIds.includes(a.id);
              return (
                <ToggleChip
                  key={a.id}
                  active={active}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      assigneeIds: active
                        ? filters.assigneeIds.filter((x) => x !== a.id)
                        : [...filters.assigneeIds, a.id],
                    })
                  }
                >
                  {a.name}
                </ToggleChip>
              );
            })}
          </FilterRow>

          {allTags.length > 0 && (
            <FilterRow label="Tags">
              {allTags.map((t) => {
                const active = filters.tags.includes(t);
                return (
                  <ToggleChip
                    key={t}
                    active={active}
                    onClick={() =>
                      setFilters({
                        ...filters,
                        tags: active
                          ? filters.tags.filter((x) => x !== t)
                          : [...filters.tags, t],
                      })
                    }
                  >
                    #{t}
                  </ToggleChip>
                );
              })}
            </FilterRow>
          )}
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ToggleChip({
  active,
  className,
  onClick,
  children,
}: {
  active: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2 py-0.5 text-[10px] font-medium transition " +
        (active
          ? (className ?? "border-primary/40 bg-primary/15 text-primary") +
            " ring-1 ring-current/20"
          : "border-border/60 text-muted-foreground hover:bg-muted/30 hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}
