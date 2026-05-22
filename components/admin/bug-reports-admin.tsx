"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertOctagon,
  XCircle,
  Clock,
  RotateCcw,
  UserPlus,
  Trash2,
  ChevronDown,
  Search,
  Loader2,
  Inbox,
  Bug,
  Pencil,
} from "lucide-react";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  updateBugReportAction,
  deleteBugReportAction,
  assignBugReportAction,
  acceptBugSubmissionAction,
  reopenBugAction,
} from "@/actions/bugs";

type BugStatus = "open" | "in_progress" | "resolved" | "wont_fix";
type Severity = "low" | "medium" | "high";
type SubmissionKind = "fixed" | "blocked" | "wont_fix";

export type BugAssignee = { id: string; handle: string; name: string };

export type BugSubmission = {
  kind: SubmissionKind;
  note: string;
  submittedAt: string;
  submittedByHandle: string;
  submittedByName: string;
};

export type BugRow = {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: BugStatus;
  reporterName: string;
  reporterHandle: string;
  pageUrl: string | null;
  adminNotes: string | null;
  assignedToId: string | null;
  assignedToHandle: string | null;
  assignedToName: string | null;
  resolutionNote: string | null;
  submission: BugSubmission | null;
  needsAdminReview: boolean;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Visual tokens                                                              */
/* -------------------------------------------------------------------------- */

const SEVERITY_META: Record<
  Severity,
  { label: string; chip: string; dot: string }
> = {
  high: {
    label: "High",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    dot: "bg-rose-400",
  },
  medium: {
    label: "Medium",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dot: "bg-amber-400",
  },
  low: {
    label: "Low",
    chip: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    dot: "bg-slate-400",
  },
};

const STATUS_META: Record<
  BugStatus,
  { label: string; chip: string }
> = {
  open: {
    label: "Open",
    chip: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  in_progress: {
    label: "In progress",
    chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  },
  resolved: {
    label: "Resolved",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  wont_fix: {
    label: "Won't fix",
    chip: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  },
};

const SUBMISSION_META: Record<
  SubmissionKind,
  { label: string; icon: typeof CheckCircle2; tone: string; ring: string }
> = {
  fixed: {
    label: "Fixed",
    icon: CheckCircle2,
    tone: "text-emerald-300",
    ring: "border-emerald-500/30 bg-emerald-500/5",
  },
  blocked: {
    label: "Blocked",
    icon: AlertOctagon,
    tone: "text-amber-300",
    ring: "border-amber-500/30 bg-amber-500/5",
  },
  wont_fix: {
    label: "Won't fix",
    icon: XCircle,
    tone: "text-rose-300",
    ring: "border-rose-500/30 bg-rose-500/5",
  },
};

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold shrink-0"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}

function Chip({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

function relativeTime(iso: string): string {
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

/* -------------------------------------------------------------------------- */
/*  Root                                                                       */
/* -------------------------------------------------------------------------- */

const FILTERS: { key: "review" | "open" | "in_progress" | "closed" | "all"; label: string }[] = [
  { key: "review", label: "Needs review" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export function BugReportsAdmin({
  initial,
  canManage,
  assignees,
}: {
  initial: BugRow[];
  canManage: boolean;
  assignees: BugAssignee[];
}) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("review");
  const [search, setSearch] = useState("");

  // Workload per assignee, used to annotate the picker.
  const workload = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.assignedToId) continue;
      if (r.status === "resolved" || r.status === "wont_fix") continue;
      map.set(r.assignedToId, (map.get(r.assignedToId) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const counts = useMemo(() => {
    const c = { review: 0, open: 0, in_progress: 0, closed: 0, all: rows.length };
    for (const r of rows) {
      if (r.needsAdminReview) c.review++;
      if (r.status === "open") c.open++;
      else if (r.status === "in_progress") c.in_progress++;
      else c.closed++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "review") list = list.filter((r) => r.needsAdminReview);
    else if (filter === "open") list = list.filter((r) => r.status === "open");
    else if (filter === "in_progress") list = list.filter((r) => r.status === "in_progress");
    else if (filter === "closed")
      list = list.filter(
        (r) => !r.needsAdminReview && (r.status === "resolved" || r.status === "wont_fix"),
      );
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.reporterName.toLowerCase().includes(q) ||
          r.reporterHandle.toLowerCase().includes(q) ||
          (r.assignedToName ?? "").toLowerCase().includes(q) ||
          (r.assignedToHandle ?? "").toLowerCase().includes(q),
      );
    }
    // Needs-review first, then by created desc.
    return [...list].sort((a, b) => {
      if (a.needsAdminReview !== b.needsAdminReview) return a.needsAdminReview ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [rows, filter, search]);

  const patchRow = (id: string, patch: Partial<BugRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  return (
    <div className="space-y-3">
      {/* Header / toolbar */}
      <div className="rounded-2xl border border-border/60 bg-card/40 p-3 sm:p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center h-9 w-9 rounded-xl bg-primary/15 text-primary">
              <Bug className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="font-semibold leading-tight">Bug reports</h2>
              <p className="text-[11px] text-muted-foreground">
                Triage, assign and close out reports from users.
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, reporter, assignee…"
              className="h-9 w-full rounded-lg border border-border/70 bg-background pl-8 pr-3 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = counts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {f.label}
                <span
                  className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="border-border/70 text-sm text-muted-foreground">
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Inbox className="h-6 w-6 opacity-60" />
            Nothing matches this view.
          </div>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => (
            <BugCard
              key={r.id}
              row={r}
              canManage={canManage}
              assignees={assignees}
              workload={workload}
              onUpdated={patchRow}
              onDeleted={removeRow}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card                                                                       */
/* -------------------------------------------------------------------------- */

function BugCard({
  row,
  canManage,
  assignees,
  workload,
  onUpdated,
  onDeleted,
}: {
  row: BugRow;
  canManage: boolean;
  assignees: BugAssignee[];
  workload: Map<string, number>;
  onUpdated: (id: string, patch: Partial<BugRow>) => void;
  onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const sev = SEVERITY_META[row.severity];
  const stat = STATUS_META[row.status];

  const isClosed = row.status === "resolved" || row.status === "wont_fix";
  const truncated = !expanded && row.description.length > 280;

  function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    start(async () => {
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    });
  }

  const accept = () =>
    run("accept", async () => {
      const res = await acceptBugSubmissionAction(row.id);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to accept");
        return;
      }
      toast.success("Accepted and closed");
      onUpdated(row.id, {
        status: res.status as BugStatus,
        needsAdminReview: false,
      });
    });

  const reopen = (keepAssignee: boolean) =>
    run("reopen", async () => {
      const res = await reopenBugAction({ id: row.id, keepAssignee });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to reopen");
        return;
      }
      toast.success(keepAssignee ? "Reopened for assignee" : "Reopened and unassigned");
      onUpdated(row.id, {
        status: keepAssignee && row.assignedToId ? "in_progress" : "open",
        needsAdminReview: false,
        submission: null,
        resolutionNote: null,
        ...(keepAssignee
          ? {}
          : {
              assignedToId: null,
              assignedToHandle: null,
              assignedToName: null,
            }),
      });
    });

  const assign = (userId: string | null) =>
    run("assign", async () => {
      const res = await assignBugReportAction({ id: row.id, userId });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to assign");
        return;
      }
      const picked = userId ? assignees.find((a) => a.id === userId) ?? null : null;
      onUpdated(row.id, {
        assignedToId: userId,
        assignedToHandle: picked?.handle ?? null,
        assignedToName: picked?.name ?? null,
        ...(userId && row.status === "open" ? { status: "in_progress" } : {}),
      });
      setAssignOpen(false);
      toast.success(picked ? `Assigned to ${picked.name}` : "Unassigned");
    });

  const del = () => {
    if (!confirm("Delete this bug report? This cannot be undone.")) return;
    run("delete", async () => {
      const res = await deleteBugReportAction(row.id);
      if (!res.ok) {
        toast.error("Failed to delete");
        return;
      }
      onDeleted(row.id);
      toast.success("Deleted");
    });
  };

  return (
    <article className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
      {/* Top accent stripe on needs-review */}
      {row.needsAdminReview && (
        <div className="h-0.5 bg-gradient-to-r from-amber-500/40 via-amber-400 to-amber-500/40" />
      )}

      <div className="p-3 sm:p-4 space-y-3">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base">{row.title}</h3>
              <Chip className={sev.chip}>
                <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                {sev.label}
              </Chip>
              <Chip className={stat.chip}>{stat.label}</Chip>
              {row.needsAdminReview && (
                <Chip className="bg-amber-500/15 text-amber-300 border-amber-500/30">
                  <Clock className="h-3 w-3" />
                  Needs review
                </Chip>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={row.reporterName} size={18} />
                <span className="text-foreground">{row.reporterName}</span>
                <span className="opacity-70">@{row.reporterHandle}</span>
              </span>
              <span>·</span>
              <span>{relativeTime(row.createdAt)}</span>
              {row.pageUrl ? (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[200px]">{row.pageUrl}</span>
                </>
              ) : null}
            </div>
          </div>
          {row.assignedToHandle ? (
            canManage && !isClosed ? (
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                title="Change assignee"
                className="group flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1.5 hover:border-primary/50 hover:bg-muted/50 transition"
              >
                <Avatar name={row.assignedToName ?? row.assignedToHandle} size={22} />
                <div className="text-[11px] leading-tight text-left">
                  <div className="text-foreground">{row.assignedToName}</div>
                  <div className="text-muted-foreground">@{row.assignedToHandle}</div>
                </div>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1.5">
                <Avatar name={row.assignedToName ?? row.assignedToHandle} size={22} />
                <div className="text-[11px] leading-tight">
                  <div className="text-foreground">{row.assignedToName}</div>
                  <div className="text-muted-foreground">@{row.assignedToHandle}</div>
                </div>
              </div>
            )
          ) : (
            canManage &&
            !isClosed && (
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border/70 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Assign
              </button>
            )
          )}
        </header>

        {/* Description */}
        <div className="text-sm whitespace-pre-wrap text-foreground/90">
          {truncated ? row.description.slice(0, 280) + "…" : row.description}
          {row.description.length > 280 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-2 text-[11px] text-primary hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>

        {/* Assignee submission */}
        {row.submission && <SubmissionPanel sub={row.submission} />}

        {/* Quick actions */}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {row.submission ? (
              <>
                <Button
                  size="sm"
                  onClick={accept}
                  disabled={pending}
                  className="bg-emerald-600 hover:bg-emerald-600/90"
                >
                  {busy === "accept" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Accept &amp; close
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reopen(true)}
                  disabled={pending}
                >
                  {busy === "reopen" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Reopen for assignee
                </Button>
              </>
            ) : isClosed ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => reopen(false)}
                disabled={pending}
              >
                {busy === "reopen" ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Reopen
              </Button>
            ) : !row.assignedToId ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAssignOpen(true)}
                disabled={pending || assignees.length === 0}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Assign
              </Button>
            ) : null}
            {!isClosed && (
              <button
                type="button"
                onClick={() => setShowOverride((v) => !v)}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
              >
                Override
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showOverride ? "rotate-180" : ""}`}
                />
              </button>
            )}
            {isClosed && (
              <button
                type="button"
                onClick={del}
                disabled={pending}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-rose-300/80 hover:text-rose-300 transition"
              >
                {busy === "delete" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Delete
              </button>
            )}
          </div>
        )}

        {/* Admin private notes — show inline when present */}
        {row.adminNotes && !showOverride && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Private admin note
            </div>
            <div className="whitespace-pre-wrap text-foreground/90">
              {row.adminNotes}
            </div>
          </div>
        )}

        {/* Override panel */}
        {canManage && showOverride && (
          <OverridePanel
            row={row}
            pending={pending}
            busy={busy}
            onSaveStatus={(status, adminNotes) =>
              run("status", async () => {
                const res = await updateBugReportAction({
                  id: row.id,
                  status,
                  adminNotes,
                });
                if (!res.ok) {
                  toast.error(res.error ?? "Failed to update");
                  return;
                }
                onUpdated(row.id, { status, adminNotes });
                toast.success("Updated");
              })
            }
            onDelete={del}
          />
        )}

        {assignOpen && canManage && (
          <AssigneePicker
            current={row.assignedToId}
            assignees={assignees}
            workload={workload}
            onClose={() => setAssignOpen(false)}
            onPick={(id) => assign(id)}
          />
        )}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function SubmissionPanel({ sub }: { sub: BugSubmission }) {
  const meta = SUBMISSION_META[sub.kind];
  const Icon = meta.icon;
  return (
    <div className={`rounded-xl border ${meta.ring} p-3 space-y-1.5`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${meta.tone}`}>
          <Icon className="h-3.5 w-3.5" />
          <span>{meta.label} — from assignee</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Avatar name={sub.submittedByName} size={16} />
          <span>{sub.submittedByName}</span>
          <span>·</span>
          <span>{relativeTime(sub.submittedAt)}</span>
        </div>
      </div>
      <div className="whitespace-pre-wrap text-xs text-foreground/90">{sub.note}</div>
    </div>
  );
}

function OverridePanel({
  row,
  pending,
  busy,
  onSaveStatus,
  onDelete,
}: {
  row: BugRow;
  pending: boolean;
  busy: string | null;
  onSaveStatus: (status: BugStatus, adminNotes: string) => void;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState<BugStatus>(row.status);
  const [notes, setNotes] = useState(row.adminNotes ?? "");
  const dirty = status !== row.status || (notes ?? "") !== (row.adminNotes ?? "");

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Manual override
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-muted-foreground">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as BugStatus)}
          disabled={pending}
          className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
        >
          {(Object.keys(STATUS_META) as BugStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Private admin note
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          disabled={pending}
          placeholder="Internal — visible to admins and assignee."
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm resize-y"
          maxLength={2000}
        />
      </div>
      <div className="flex justify-between gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={pending}
          className="text-rose-300"
        >
          {busy === "delete" ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          )}
          Delete
        </Button>
        <Button
          size="sm"
          disabled={pending || !dirty}
          onClick={() => onSaveStatus(status, notes)}
        >
          {busy === "status" ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : null}
          Save
        </Button>
      </div>
    </div>
  );
}

function AssigneePicker({
  current,
  assignees,
  workload,
  onClose,
  onPick,
}: {
  current: string | null;
  assignees: BugAssignee[];
  workload: Map<string, number>;
  onClose: () => void;
  onPick: (id: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return assignees;
    return assignees.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.handle.toLowerCase().includes(term),
    );
  }, [assignees, q]);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Pick an assignee
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          autoFocus
          className="h-9 w-full rounded-lg border border-border/70 bg-background pl-8 pr-3 text-sm"
        />
      </div>
      <ul className="max-h-64 overflow-y-auto divide-y divide-border/40 rounded-lg border border-border/40">
        {current && (
          <li>
            <button
              type="button"
              onClick={() => onPick(null)}
              className="w-full text-left px-3 py-2 text-xs text-rose-300 hover:bg-muted/30 inline-flex items-center gap-2"
            >
              <XCircle className="h-3.5 w-3.5" />
              Unassign
            </button>
          </li>
        )}
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-xs text-muted-foreground">No matches.</li>
        ) : (
          filtered.map((a) => {
            const active = current === a.id;
            const load = workload.get(a.id) ?? 0;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onPick(a.id)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                    active ? "bg-primary/10" : "hover:bg-muted/30"
                  }`}
                >
                  <Avatar name={a.name} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      @{a.handle}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] rounded-full px-2 py-0.5 ${
                      load === 0
                        ? "bg-emerald-500/10 text-emerald-300"
                        : load < 3
                          ? "bg-amber-500/10 text-amber-300"
                          : "bg-rose-500/10 text-rose-300"
                    }`}
                    title="Active bugs assigned"
                  >
                    {load} active
                  </span>
                  {active ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
