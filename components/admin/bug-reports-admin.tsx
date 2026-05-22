"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  updateBugReportAction,
  deleteBugReportAction,
  assignBugReportAction,
} from "@/actions/bugs";

type BugStatus = "open" | "in_progress" | "resolved" | "wont_fix";
type Severity = "low" | "medium" | "high";

export type BugAssignee = { id: string; handle: string; name: string };

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
  createdAt: string;
};

const STATUSES: { value: BugStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't fix" },
];

const statusTone = (s: BugStatus) =>
  s === "open"
    ? "warning"
    : s === "in_progress"
      ? "accent"
      : s === "resolved"
        ? "success"
        : "default";

const severityTone = (s: Severity) =>
  s === "high" ? "danger" : s === "medium" ? "warning" : "default";

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
  const [filter, setFilter] = useState<BugStatus | "all">("all");

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const counts = rows.reduce<Record<BugStatus | "all", number>>(
    (acc, r) => {
      acc.all += 1;
      acc[r.status] += 1;
      return acc;
    },
    { all: 0, open: 0, in_progress: 0, resolved: 0, wont_fix: 0 },
  );

  const onUpdated = (id: string, patch: Partial<BugRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const onDeleted = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  return (
    <div className="space-y-3">
      <Card className="border-border/70">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Bug reports</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Submitted by users via the &ldquo;Report a bug&rdquo; button.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...STATUSES.map((s) => s.value)] as const).map((s) => {
              const label = s === "all" ? "All" : STATUSES.find((x) => x.value === s)!.label;
              const isActive = filter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s as typeof filter)}
                  className={
                    "rounded-lg px-2.5 py-1 text-xs border transition " +
                    (isActive
                      ? "bg-primary/15 text-primary border-primary/30 font-medium"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40")
                  }
                >
                  {label}
                  <span className="ml-1 text-[10px] opacity-70">{counts[s]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="border-border/70 text-sm text-muted-foreground">
          No bug reports {filter === "all" ? "yet" : `with status "${filter}"`}.
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => (
            <BugCard key={r.id} row={r} canManage={canManage} assignees={assignees} onUpdated={onUpdated} onDeleted={onDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}

function BugCard({
  row,
  canManage,
  assignees,
  onUpdated,
  onDeleted,
}: {
  row: BugRow;
  canManage: boolean;
  assignees: BugAssignee[];
  onUpdated: (id: string, patch: Partial<BugRow>) => void;
  onDeleted: (id: string) => void;
}) {
  const [status, setStatus] = useState<BugStatus>(row.status);
  const [notes, setNotes] = useState(row.adminNotes ?? "");
  const [assignedToId, setAssignedToId] = useState<string>(row.assignedToId ?? "");
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const dirty = status !== row.status || (notes ?? "") !== (row.adminNotes ?? "");
  const assigneeDirty = (assignedToId || null) !== (row.assignedToId || null);

  const save = () => {
    start(async () => {
      const res = await updateBugReportAction({ id: row.id, status, adminNotes: notes });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to update");
        return;
      }
      toast.success("Bug updated");
      onUpdated(row.id, { status, adminNotes: notes });
    });
  };

  const saveAssignee = () => {
    const next = assignedToId || null;
    start(async () => {
      const res = await assignBugReportAction({ id: row.id, userId: next });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to assign");
        return;
      }
      const picked = assignees.find((a) => a.id === next);
      const patch: Partial<BugRow> = {
        assignedToId: next,
        assignedToHandle: picked?.handle ?? null,
        assignedToName: picked?.name ?? null,
      };
      if (next && row.status === "open") patch.status = "in_progress";
      onUpdated(row.id, patch);
      if (next && row.status === "open") setStatus("in_progress");
      toast.success(next ? `Assigned to @${picked?.handle ?? "user"}` : "Unassigned");
    });
  };

  const del = () => {
    if (!confirm("Delete this bug report? This cannot be undone.")) return;
    start(async () => {
      const res = await deleteBugReportAction(row.id);
      if (!res.ok) {
        toast.error("Failed to delete");
        return;
      }
      toast.success("Bug deleted");
      onDeleted(row.id);
    });
  };

  return (
    <Card className="border-border/70 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{row.title}</h3>
            <Badge tone={severityTone(row.severity)}>{row.severity}</Badge>
            <Badge tone={statusTone(row.status)}>{row.status.replace("_", " ")}</Badge>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            from <span className="text-foreground">{row.reporterName}</span>{" "}
            <span className="opacity-70">@{row.reporterHandle}</span> ·{" "}
            {new Date(row.createdAt).toLocaleString()}
            {row.pageUrl ? <span className="ml-1">· {row.pageUrl}</span> : null}
          </div>
          {row.assignedToHandle && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              assigned to <span className="text-foreground">{row.assignedToName}</span>{" "}
              <span className="opacity-70">@{row.assignedToHandle}</span>
            </div>
          )}
        </div>
      </div>

      <div className="text-sm whitespace-pre-wrap text-foreground/90">
        {expanded || row.description.length < 280
          ? row.description
          : row.description.slice(0, 280) + "…"}
        {row.description.length >= 280 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-2 text-[11px] text-primary hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {row.resolutionNote && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-success font-semibold mb-1">
            Resolution note from {row.assignedToName ?? "assignee"}
          </div>
          <div className="whitespace-pre-wrap text-foreground/90">{row.resolutionNote}</div>
        </div>
      )}

      {canManage && (
        <div className="border-t border-border/40 pt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Assignee
            </label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              disabled={pending}
              className="h-9 rounded-lg border border-border bg-card px-2 text-xs min-w-[160px]"
            >
              <option value="">— Unassigned —</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (@{a.handle})
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={saveAssignee}
              disabled={pending || !assigneeDirty}
            >
              {assignedToId ? "Assign" : "Unassign"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BugStatus)}
              disabled={pending}
              className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Admin notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={pending}
              placeholder="Internal notes (only admins can see this)"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm resize-y"
              maxLength={2000}
            />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={del} disabled={pending}>
              Delete
            </Button>
            <Button size="sm" loading={pending} disabled={!dirty} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
