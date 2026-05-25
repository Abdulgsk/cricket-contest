/**
 * Top-level orchestrator. Owns:
 *   - URL-synced filter + view state
 *   - Selection set (for bulk operations)
 *   - Keyboard shortcuts (j/k navigate, /, x select, e/Enter open, Esc clear)
 *   - Drawer open/close + URL permalink
 *   - Optimistic refresh after server actions
 *
 * Public surface is exported as `WorkItemsPanel` and re-exported by
 * `components/dev/work-items-panel.tsx` so the developer page import path is
 * preserved.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Toolbar } from "./toolbar";
import { Drawer } from "./drawer";
import { BulkBar } from "./bulk-bar";
import { BoardView, CalendarView, ListView, MineView, TableView } from "./views";
import { reorderWorkItemAction } from "@/actions/work-items";
import { DEFAULT_FILTERS } from "./types";
import type {
  Filters,
  Priority,
  SavedView,
  Status,
  ViewMode,
  WorkItemAssignee,
  WorkItemRow,
} from "./types";

/* Re-export shared types so existing imports keep working. */
export type { WorkItemRow, WorkItemAssignee, SavedView } from "./types";

/* -------------------------------------------------------------------------- */
/*  URL <-> Filters                                                            */
/* -------------------------------------------------------------------------- */

function filtersFromUrl(sp: URLSearchParams): { view?: ViewMode; filters: Filters } {
  const status = (sp.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Status =>
      ["open", "in_progress", "blocked", "done"].includes(s),
    );
  const priority = (sp.get("priority") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Priority => ["low", "medium", "high"].includes(s));
  const tags = (sp.get("tags") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const assigneeIds = (sp.get("assignee") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const search = sp.get("q") ?? "";
  const quickRaw = sp.get("quick");
  const quick: Filters["quick"] =
    quickRaw === "mine" ||
    quickRaw === "unassigned" ||
    quickRaw === "overdue" ||
    quickRaw === "review"
      ? quickRaw
      : "all";
  const viewRaw = sp.get("view");
  const view: ViewMode | undefined =
    viewRaw === "list" ||
    viewRaw === "board" ||
    viewRaw === "table" ||
    viewRaw === "calendar" ||
    viewRaw === "mine"
      ? viewRaw
      : undefined;
  return {
    view,
    filters: { status, priority, tags, assigneeIds, search, quick },
  };
}

function writeFiltersToUrl(
  router: ReturnType<typeof useRouter>,
  sp: URLSearchParams,
  view: ViewMode,
  f: Filters,
  itemId: string | null,
) {
  const next = new URLSearchParams(sp.toString());
  const setOrDel = (k: string, v: string) => {
    if (v) next.set(k, v);
    else next.delete(k);
  };
  setOrDel("view", view);
  setOrDel("q", f.search);
  setOrDel("quick", f.quick === "all" ? "" : f.quick);
  setOrDel("status", f.status.join(","));
  setOrDel("priority", f.priority.join(","));
  setOrDel("tags", f.tags.join(","));
  setOrDel("assignee", f.assigneeIds.join(","));
  if (itemId) next.set("item", itemId);
  else next.delete("item");
  router.replace(`?${next.toString()}`, { scroll: false });
}

/* -------------------------------------------------------------------------- */
/*  Filter logic                                                               */
/* -------------------------------------------------------------------------- */

function matches(row: WorkItemRow, f: Filters, myUserId?: string): boolean {
  if (f.status.length > 0 && !f.status.includes(row.status)) return false;
  if (f.priority.length > 0 && !f.priority.includes(row.priority)) return false;
  if (f.assigneeIds.length > 0 && !f.assigneeIds.includes(row.assignedToId))
    return false;
  if (f.tags.length > 0 && !f.tags.every((t) => row.tags.includes(t))) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${row.title} ${row.description} ${row.tags.join(" ")} ${row.assignedToName}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  switch (f.quick) {
    case "mine":
      if (!myUserId || row.assignedToId !== myUserId) return false;
      break;
    case "unassigned":
      if (row.assignedToId) return false;
      break;
    case "overdue":
      if (!row.dueAt) return false;
      if (new Date(row.dueAt).getTime() >= Date.now()) return false;
      if (row.status === "done") return false;
      break;
    case "review":
      if (!row.needsReview) return false;
      break;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function WorkItemsPanel({
  initial,
  canManage,
  assignees,
  myUserId,
  initialView = "list",
  savedViews = [],
}: {
  initial: WorkItemRow[];
  canManage: boolean;
  assignees: WorkItemAssignee[];
  myUserId?: string;
  initialView?: ViewMode;
  savedViews?: SavedView[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Hydrate from URL on mount; falls back to user-pref default.
  const initialFromUrl = useMemo(
    () => filtersFromUrl(new URLSearchParams(searchParams?.toString() ?? "")),
    [searchParams],
  );

  const [view, setView] = useState<ViewMode>(initialFromUrl.view ?? initialView);
  const [filters, setFilters] = useState<Filters>(initialFromUrl.filters);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const itemParam = searchParams?.get("item") ?? null;

  // Mirror filter/view changes back to the URL (replace, no history spam).
  useEffect(() => {
    writeFiltersToUrl(
      router,
      new URLSearchParams(searchParams?.toString() ?? ""),
      view,
      filters,
      itemParam,
    );
    // We intentionally do NOT depend on searchParams to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filters]);

  const filtered = useMemo(
    () => initial.filter((r) => matches(r, filters, myUserId)),
    [initial, filters, myUserId],
  );

  const openDrawer = useCallback(
    (id: string) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      sp.set("item", id);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeDrawer = useCallback(() => {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.delete("item");
    router.replace(`?${sp.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const onSelectChange = useCallback((id: string, next: boolean) => {
    setSelection((curr) => {
      const ns = new Set(curr);
      if (next) ns.add(id);
      else ns.delete(id);
      return ns;
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const resetFilters = useCallback(() => setFilters({ ...DEFAULT_FILTERS }), []);

  /* ---------------- Drag reorder (board) ---------------- */

  const onReorder = useCallback(
    async (movedId: string, toStatus: Status, siblings: string[]) => {
      const res = await reorderWorkItemAction({
        id: movedId,
        status: toStatus,
        siblings,
      });
      if (!res || res.ok === false) {
        toast.error(res?.error ?? "Reorder failed");
        return;
      }
      router.refresh();
    },
    [router],
  );

  /* ---------------- Keyboard shortcuts ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inEditable =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          (t as HTMLElement).isContentEditable);
      // "/" focuses search (works even inside editable? skip to avoid disruption)
      if (e.key === "/" && !inEditable) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>("[data-wi-search]")
          ?.focus();
        return;
      }
      if (inEditable) return;
      // Esc clears selection (drawer Esc is handled separately)
      if (e.key === "Escape" && !itemParam && selection.size > 0) {
        clearSelection();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemParam, selection.size, clearSelection]);

  const openRow = itemParam ? initial.find((r) => r.id === itemParam) : null;

  return (
    <div className="space-y-3">
      <Toolbar
        view={view}
        setView={setView}
        filters={filters}
        setFilters={setFilters}
        resetFilters={resetFilters}
        rows={initial}
        canManage={canManage}
        assignees={assignees}
        savedViews={savedViews}
        countTotal={initial.length}
        countShown={filtered.length}
      />

      {/* Render the chosen view */}
      {view === "list" && (
        <ListView
          rows={filtered}
          selection={selection}
          onSelectChange={onSelectChange}
          onOpen={openDrawer}
        />
      )}
      {view === "board" && (
        <BoardView
          rows={filtered}
          selection={selection}
          onSelectChange={onSelectChange}
          onOpen={openDrawer}
          onReorder={onReorder}
          canManage={canManage}
        />
      )}
      {view === "table" && (
        <TableView
          rows={filtered}
          selection={selection}
          onSelectChange={onSelectChange}
          onOpen={openDrawer}
        />
      )}
      {view === "calendar" && <CalendarView rows={filtered} onOpen={openDrawer} />}
      {view === "mine" && (
        <MineView
          rows={filtered}
          myUserId={myUserId}
          selection={selection}
          onSelectChange={onSelectChange}
          onOpen={openDrawer}
        />
      )}

      {canManage && (
        <BulkBar
          selectedIds={[...selection]}
          assignees={assignees}
          onClear={clearSelection}
        />
      )}

      {openRow && (
        <Drawer
          row={openRow}
          canManage={canManage}
          assignees={assignees}
          myUserId={myUserId}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
