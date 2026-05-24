"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Bug,
  CheckCircle2,
  CheckSquare,
  Clock,
  Command as CommandIcon,
  Download,
  Filter,
  HelpCircle,
  Image as ImageIcon,
  Inbox,
  MessageSquare,
  Paperclip,
  Search,
  Sparkles,
  Square,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SlaBadge, AgeBadge } from "@/components/ui/sla-badge";
import { CommandPalette, type CommandItem } from "@/components/ui/command-palette";
import { KeyboardHelp } from "@/components/ui/keyboard-help";
import { BugDetailPanel, type BugDetail } from "@/components/bug/bug-detail-panel";
import { BugActionBar } from "@/components/bug/bug-action-bar";
import {
  bulkBugAction,
  exportBugsCsvAction,
} from "@/actions/bugs";
import {
  STATUS_LABEL,
  type BugStatus,
  type Severity,
  colorFromString,
  initials,
  relTime,
} from "@/lib/bug-format";
import { useLiveSync } from "@/lib/use-live-sync";
import { useConfirm } from "@/components/ui/use-confirm";

export type InboxBugRow = {
  id: string;
  title: string;
  severity: Severity;
  status: BugStatus;
  needsAdminReview: boolean;
  reporterName: string;
  reporterHandle: string;
  pageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  hasScreenshots: boolean;
  commentCount: number;
  lastReadAt: string | null;
  submissionKind: "fixed" | "blocked" | "wont_fix" | null;
  /** Admin-only: assignee for filtering. */
  assigneeId?: string | null;
  assigneeName?: string | null;
  /** Pre-loaded detail for instant open. */
  detail: BugDetail;
};

type Filter = "active" | "review" | "closed" | "all";

const FILTER_LABEL: Record<Filter, string> = {
  active: "Active",
  review: "Awaiting review",
  closed: "Closed",
  all: "All",
};

function matchesFilter(b: InboxBugRow, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "review") return b.needsAdminReview;
  if (f === "closed") return b.status === "resolved" || b.status === "wont_fix";
  // active
  return !b.needsAdminReview && b.status !== "resolved" && b.status !== "wont_fix";
}

const SEVERITY_DOT: Record<Severity, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-muted-foreground/40",
};

function isUnread(b: InboxBugRow): boolean {
  if (b.commentCount === 0 && !b.needsAdminReview) return false;
  if (!b.lastReadAt) return true;
  return new Date(b.updatedAt).getTime() > new Date(b.lastReadAt).getTime();
}

/* ------------------------------------------------------------------------ */

export function BugsInboxClient({
  rows,
  myUserId,
  canManage,
  assignables,
  emptyTitle = "All clear",
  emptyHint = "No bugs on your plate.",
  /** Admin mode: enables bulk-select, severity / assignee filters, CSV export. */
  adminMode = false,
}: {
  rows: InboxBugRow[];
  myUserId: string;
  canManage: boolean;
  assignables: Array<{ id: string; handle: string; name: string }>;
  emptyTitle?: string;
  emptyHint?: string;
  adminMode?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [filter, setFilter] = React.useState<Filter>("active");
  const [q, setQ] = React.useState("");
  const [severityFilter, setSeverityFilter] = React.useState<Severity | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string | "all" | "unassigned">("all");
  const [palOpen, setPalOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [bulkSel, setBulkSel] = React.useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = React.useTransition();
  const confirm = useConfirm();

  useLiveSync({ enabled: true });

  const filtered = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((b) => {
      if (!matchesFilter(b, filter)) return false;
      if (severityFilter !== "all" && b.severity !== severityFilter) return false;
      if (assigneeFilter === "unassigned" && b.assigneeId) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && b.assigneeId !== assigneeFilter)
        return false;
      if (!ql) return true;
      return (
        b.title.toLowerCase().includes(ql) ||
        b.reporterName.toLowerCase().includes(ql) ||
        b.reporterHandle.toLowerCase().includes(ql) ||
        (b.assigneeName ?? "").toLowerCase().includes(ql)
      );
    });
  }, [rows, filter, q, severityFilter, assigneeFilter]);

  const counts = React.useMemo(
    () => ({
      active: rows.filter((b) => matchesFilter(b, "active")).length,
      review: rows.filter((b) => matchesFilter(b, "review")).length,
      closed: rows.filter((b) => matchesFilter(b, "closed")).length,
      all: rows.length,
    }),
    [rows],
  );

  // selected bug
  const urlSelected = search.get("b");
  const initialSelected = urlSelected && filtered.some((b) => b.id === urlSelected)
    ? urlSelected
    : filtered[0]?.id ?? null;
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelected);

  React.useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((b) => b.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // sync to URL (replace, not push)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("b", selectedId);
    else url.searchParams.delete("b");
    window.history.replaceState({}, "", url.toString());
  }, [selectedId]);

  // keyboard nav: j/k or arrows
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!filtered.length) return;
      const idx = filtered.findIndex((b) => b.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedId(filtered[Math.min(filtered.length - 1, idx + 1)].id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedId(filtered[Math.max(0, idx - 1)].id);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        document.getElementById("bug-inbox-search")?.focus();
      } else if (e.key === "Enter") {
        const sel = filtered.find((b) => b.id === selectedId);
        if (sel) router.push(`/bugs/${sel.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedId, router]);

  const selected = filtered.find((b) => b.id === selectedId) ?? null;

  // ---- Admin: bulk actions ---------------------------------------------
  const allFilteredIds = React.useMemo(() => filtered.map((b) => b.id), [filtered]);
  const allSelected = bulkSel.size > 0 && allFilteredIds.every((id) => bulkSel.has(id));
  const toggleBulk = React.useCallback((id: string) => {
    setBulkSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearBulk = React.useCallback(() => setBulkSel(new Set()), []);
  const selectAllVisible = React.useCallback(() => {
    setBulkSel(new Set(allFilteredIds));
  }, [allFilteredIds]);

  const runBulk = React.useCallback(
    async (
      op: "accept" | "reopen" | "delete" | "status",
      extra?: { status?: "open" | "in_progress" | "resolved" | "wont_fix" },
    ) => {
      if (bulkSel.size === 0) return;
      const ids = Array.from(bulkSel);
      const n = ids.length;
      const promptByOp: Record<typeof op, { title: string; tone?: "danger" }> = {
        accept: { title: `Accept & close ${n} bug${n === 1 ? "" : "s"}?` },
        reopen: { title: `Reopen ${n} bug${n === 1 ? "" : "s"}?` },
        status: {
          title: `Set status to "${extra?.status}" for ${n} bug${n === 1 ? "" : "s"}?`,
        },
        delete: {
          title: `Delete ${n} bug${n === 1 ? "" : "s"}?`,
          tone: "danger" as const,
        },
      };
      const conf = promptByOp[op];
      const ok = await confirm({
        title: conf.title,
        description:
          op === "delete"
            ? "All comments, attachments, and history will be lost. This cannot be undone."
            : "This will apply to every selected bug.",
        confirmLabel: op === "delete" ? "Delete all" : "Apply",
        tone: conf.tone,
      });
      if (!ok) return;
      startBulk(async () => {
        const res = await bulkBugAction({ ids, op, payload: extra ?? {} });
        if (res?.ok === false) {
          toast.error(res.error ?? "Bulk action failed");
        } else {
          toast.success(`${n} bug${n === 1 ? "" : "s"} updated`);
          clearBulk();
          router.refresh();
        }
      });
    },
    [bulkSel, clearBulk, confirm, router, startBulk],
  );

  const runExport = React.useCallback(() => {
    startBulk(async () => {
      const res = await exportBugsCsvAction();
      if (res?.ok && res.csv) {
        // Filter rows in-browser if a subset is selected
        let csv = res.csv;
        if (bulkSel.size > 0) {
          const idSet = bulkSel;
          const [header, ...rest] = csv.split("\n");
          csv = [header, ...rest.filter((line) => idSet.has(line.split(",")[0]))].join("\n");
        }
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bugs-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(
          bulkSel.size > 0
            ? `Exported ${bulkSel.size} selected`
            : `Exported all bugs`,
        );
      } else {
        toast.error(res?.error ?? "Export failed");
      }
    });
  }, [bulkSel, startBulk]);

  // ---- Command palette + global shortcuts ------------------------------
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalOpen((v) => !v);
        return;
      }
      if (inField) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === "x" && adminMode && selectedId) {
        e.preventDefault();
        toggleBulk(selectedId);
      } else if (e.key === "Escape") {
        if (bulkSel.size > 0) clearBulk();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adminMode, selectedId, toggleBulk, bulkSel.size, clearBulk]);

  const commandItems = React.useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];
    // Jump to bug
    for (const b of filtered.slice(0, 30)) {
      items.push({
        id: `bug:${b.id}`,
        label: b.title,
        hint: `#${b.id.slice(-6)} · ${STATUS_LABEL[b.status]}`,
        group: "Jump to bug",
        keywords: [b.reporterName, b.reporterHandle, b.severity].join(" "),
        perform: () => {
          setSelectedId(b.id);
        },
      });
    }
    if (adminMode) {
      items.push({
        id: "filter:review",
        label: "Filter: Awaiting review",
        group: "Filters",
        perform: () => setFilter("review"),
      });
      items.push({
        id: "filter:active",
        label: "Filter: Active",
        group: "Filters",
        perform: () => setFilter("active"),
      });
      items.push({
        id: "filter:closed",
        label: "Filter: Closed",
        group: "Filters",
        perform: () => setFilter("closed"),
      });
      items.push({
        id: "filter:all",
        label: "Filter: All",
        group: "Filters",
        perform: () => setFilter("all"),
      });
      items.push({
        id: "sev:clear",
        label: "Severity: All",
        group: "Filters",
        perform: () => setSeverityFilter("all"),
      });
      for (const sev of ["low", "medium", "high"] as const) {
        items.push({
          id: `sev:${sev}`,
          label: `Severity: ${sev}`,
          group: "Filters",
          perform: () => setSeverityFilter(sev),
        });
      }
      items.push({
        id: "export",
        label: bulkSel.size > 0 ? `Export ${bulkSel.size} selected (CSV)` : "Export visible (CSV)",
        group: "Actions",
        icon: <Download className="h-3.5 w-3.5" />,
        perform: runExport,
      });
      if (bulkSel.size > 0) {
        items.push({
          id: "bulk:accept",
          label: `Bulk accept ${bulkSel.size}`,
          group: "Bulk",
          perform: () => runBulk("accept"),
        });
        items.push({
          id: "bulk:reopen",
          label: `Bulk reopen ${bulkSel.size}`,
          group: "Bulk",
          perform: () => runBulk("reopen"),
        });
        items.push({
          id: "bulk:delete",
          label: `Bulk delete ${bulkSel.size}`,
          group: "Bulk",
          perform: () => runBulk("delete"),
        });
      }
    }
    items.push({
      id: "help",
      label: "Show keyboard shortcuts",
      group: "Help",
      icon: <HelpCircle className="h-3.5 w-3.5" />,
      shortcut: ["?"],
      perform: () => setHelpOpen(true),
    });
    return items;
  }, [filtered, adminMode, bulkSel.size, runBulk, runExport]);

  return (
    <div className="space-y-2">
      {/* admin top toolbar */}
      {adminMode ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/40 px-3 py-2 backdrop-blur">
          <button
            type="button"
            onClick={() => setPalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            <CommandIcon className="h-3.5 w-3.5" />
            Command…
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </button>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as Severity | "all")}
            className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11.5px] outline-none"
          >
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {assignables.length > 0 ? (
            <select
              value={assigneeFilter}
              onChange={(e) =>
                setAssigneeFilter(e.target.value as string | "all" | "unassigned")
              }
              className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-[11.5px] outline-none"
            >
              <option value="all">Any assignee</option>
              <option value="unassigned">Unassigned</option>
              {assignables.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={runExport}
              disabled={bulkPending}
            >
              <Download className="h-3.5 w-3.5" />
              Export {bulkSel.size > 0 ? `${bulkSel.size}` : "CSV"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHelpOpen(true)}
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* bulk action bar */}
      {adminMode && bulkSel.size > 0 ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.07] px-3 py-1.5 text-[12px] shadow-sm backdrop-blur">
          <span className="font-semibold text-primary">{bulkSel.size} selected</span>
          <button
            type="button"
            onClick={selectAllVisible}
            className="rounded-md px-2 py-0.5 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
          >
            Select all visible ({allFilteredIds.length})
          </button>
          <span className="mx-1 h-3 w-px bg-border" />
          <Button
            size="sm"
            variant="ghost"
            disabled={bulkPending}
            onClick={() => runBulk("accept")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={bulkPending}
            onClick={() => runBulk("reopen")}
          >
            Reopen
          </Button>
          <select
            disabled={bulkPending}
            onChange={(e) => {
              const v = e.target.value as
                | ""
                | "open"
                | "in_progress"
                | "resolved"
                | "wont_fix";
              if (!v) return;
              runBulk("status", { status: v });
              e.currentTarget.value = "";
            }}
            className="rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11.5px] outline-none"
            defaultValue=""
          >
            <option value="" disabled>
              Set status…
            </option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="wont_fix">Won&apos;t fix</option>
          </select>
          <Button
            size="sm"
            variant="ghost"
            disabled={bulkPending}
            onClick={() => runBulk("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <button
            type="button"
            onClick={clearBulk}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      ) : null}

      <div className="grid h-[calc(100vh-9rem)] min-h-[500px] grid-cols-1 gap-3 md:grid-cols-[340px_1fr]">
      {/* ------------------------------------------------------------------ */}
      {/* LEFT: list rail                                                     */}
      {/* ------------------------------------------------------------------ */}
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/40 backdrop-blur">
        <div className="space-y-2 border-b border-border/50 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="bug-inbox-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="block w-full rounded-lg border border-border/60 bg-background/60 py-1.5 pl-7 pr-12 text-[12.5px] outline-none transition focus:border-primary"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <Kbd>/</Kbd>
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["active", "review", "closed", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
                  filter === f
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {FILTER_LABEL[f]}
                <span className="rounded-md bg-muted/70 px-1 text-[10px] tabular-nums">
                  {counts[f]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <li className="px-4 py-10 text-center">
              <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
              <div className="text-sm font-medium">{emptyTitle}</div>
              <div className="text-[12px] text-muted-foreground">{emptyHint}</div>
            </li>
          ) : (
            filtered.map((b) => {
              const unread = isUnread(b);
              const isBulk = bulkSel.has(b.id);
              return (
                <li key={b.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(b.id);
                      }
                    }}
                    className={cn(
                      "group block w-full cursor-pointer rounded-xl border px-2.5 py-2 text-left text-[12.5px] transition",
                      selectedId === b.id
                        ? "border-primary/40 bg-primary/[0.07] shadow-sm"
                        : "border-transparent hover:bg-muted/40",
                      isBulk && "ring-1 ring-primary/40",
                      "mb-1",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {adminMode ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBulk(b.id);
                          }}
                          className="mt-0.5 text-muted-foreground hover:text-foreground"
                          aria-label={isBulk ? "Deselect" : "Select"}
                        >
                          {isBulk ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 opacity-50 group-hover:opacity-100" />
                          )}
                        </button>
                      ) : null}
                      <span className="mt-1.5 flex w-2 shrink-0 flex-col items-center gap-1">
                        <span
                          className={cn("h-2 w-2 rounded-full", SEVERITY_DOT[b.severity])}
                          title={`severity: ${b.severity}`}
                        />
                        {unread ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" title="unread" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "truncate font-medium",
                              unread ? "text-foreground" : "text-foreground/85",
                            )}
                          >
                            {b.title}
                          </span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                          <span>{relTime(b.updatedAt)}</span>
                          <span>·</span>
                          <ReporterDot name={b.reporterName} />
                          {b.commentCount > 0 ? (
                            <span className="inline-flex items-center gap-0.5">
                              <MessageSquare className="h-3 w-3" />
                              {b.commentCount}
                            </span>
                          ) : null}
                          {b.hasScreenshots ? (
                            <span className="inline-flex items-center gap-0.5">
                              <Paperclip className="h-3 w-3" />
                            </span>
                          ) : null}
                          {b.dueAt ? <SlaBadge dueAt={b.dueAt} size="sm" /> : null}
                          <AgeBadge createdAt={b.createdAt} status={b.status} />
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <MiniStatus b={b} />
                          {adminMode && b.assigneeName ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-card/60 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                              <UserPlus className="h-2.5 w-2.5" />
                              {b.assigneeName}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* RIGHT: detail pane                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-card/40 backdrop-blur">
        {selected ? (
          <BugDetailPanel
            key={selected.id}
            bug={selected.detail}
            myUserId={myUserId}
            canManage={canManage}
            embedded
            actions={
              <BugActionBar
                bug={selected.detail}
                myUserId={myUserId}
                canManage={canManage}
                assignables={assignables}
              />
            }
          />
        ) : (
          <EmptyDetail />
        )}
      </section>
      </div>

      <CommandPalette
        open={palOpen}
        onOpenChange={setPalOpen}
        items={commandItems}
        placeholder="Type a command or search bugs…"
      />
      <KeyboardHelp
        open={helpOpen}
        onOpenChange={setHelpOpen}
        shortcuts={[
          { keys: ["/"], label: "Focus search", group: "Navigation" },
          { keys: ["j"], label: "Next bug", group: "Navigation" },
          { keys: ["k"], label: "Previous bug", group: "Navigation" },
          { keys: ["↵"], label: "Open permalink", group: "Navigation" },
          { keys: ["⌘", "K"], label: "Command palette", group: "Global" },
          { keys: ["?"], label: "Show shortcuts", group: "Global" },
          ...(adminMode
            ? [
                { keys: ["x"], label: "Toggle bulk-select", group: "Admin" },
                { keys: ["Esc"], label: "Clear selection", group: "Admin" },
              ]
            : []),
        ]}
      />
    </div>
  );
}

function ReporterDot({ name }: { name: string }) {
  const c = colorFromString(name);
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold"
        style={{ background: c.bg, color: c.fg }}
      >
        {initials(name)}
      </span>
      <span className="truncate max-w-[12ch]">{name}</span>
    </span>
  );
}

function MiniStatus({ b }: { b: InboxBugRow }) {
  if (b.needsAdminReview) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-accent">
        <Clock className="h-2.5 w-2.5" />
        review
      </span>
    );
  }
  if (b.status === "resolved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-2.5 w-2.5" />
        resolved
      </span>
    );
  }
  if (b.status === "wont_fix") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        won&apos;t fix
      </span>
    );
  }
  if (b.status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
        in progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-primary">
      open
    </span>
  );
}

function EmptyDetail() {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold">Pick a bug to triage</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Use{" "}
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> or <Kbd>j</Kbd> <Kbd>k</Kbd> to navigate ·{" "}
          <Kbd>↵</Kbd> to open the permalink · <Kbd>/</Kbd> to search.
        </p>
      </div>
    </div>
  );
}
