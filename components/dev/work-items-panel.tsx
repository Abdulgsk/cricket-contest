"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createWorkItemAction,
  updateWorkItemAction,
  deleteWorkItemAction,
  acceptWorkItemSubmissionAction,
  reopenWorkItemAction,
  addWorkItemCommentAction,
  requestWorkItemChangesAction,
} from "@/actions/work-items";
import { ActivityThread, type ActivityEntry } from "@/components/activity-thread";
import { CommentComposer } from "@/components/comment-composer";
import { RequestChangesDialog } from "@/components/request-changes-dialog";

export type WorkItemSubmission = {
  kind: "done" | "blocked" | "wont_do";
  note: string;
  submittedAt: string;
  submittedByHandle: string;
  submittedByName: string;
};

export type WorkItemRow = {
  id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "blocked" | "done";
  priority: "low" | "medium" | "high";
  createdByName: string;
  createdByHandle: string;
  assignedToId: string;
  assignedToName: string;
  assignedToHandle: string;
  dueAt: string | null;
  createdAt: string;
  submission: WorkItemSubmission | null;
  needsReview: boolean;
  activity: ActivityEntry[];
};

export type WorkItemAssignee = { id: string; name: string; handle: string };

const STATUS_LABEL: Record<WorkItemRow["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const STATUS_TONE: Record<
  WorkItemRow["status"],
  "default" | "accent" | "warning" | "success" | "danger"
> = {
  open: "default",
  in_progress: "accent",
  blocked: "danger",
  done: "success",
};

const PRIORITY_TONE: Record<
  WorkItemRow["priority"],
  "default" | "warning" | "danger"
> = {
  low: "default",
  medium: "warning",
  high: "danger",
};

const SUBMISSION_LABEL: Record<WorkItemSubmission["kind"], string> = {
  done: "Done",
  blocked: "Blocked",
  wont_do: "Won't do",
};

const SUBMISSION_RING: Record<WorkItemSubmission["kind"], string> = {
  done: "border-violet-500/25 bg-violet-500/[0.06] dark:bg-violet-500/[0.08]",
  blocked: "border-amber-500/25 bg-amber-400/[0.06] dark:bg-amber-500/[0.08]",
  wont_do: "border-rose-500/25 bg-rose-500/[0.06] dark:bg-rose-500/[0.08]",
};

export function WorkItemsPanel({
  initial,
  canManage,
  assignees,
  myUserId,
}: {
  initial: WorkItemRow[];
  canManage: boolean;
  assignees: WorkItemAssignee[];
  myUserId?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<"open" | "review" | "all" | "done">("open");
  const [showCreate, setShowCreate] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = rows.filter((r) => {
    if (filter === "open") return r.status !== "done" && !r.needsReview;
    if (filter === "review") return r.needsReview;
    if (filter === "done") return r.status === "done";
    return true;
  });

  const reviewCount = rows.filter((r) => r.needsReview).length;
  const openCount = rows.filter((r) => r.status !== "done").length;

  const updateLocal = (id: string, patch: Partial<WorkItemRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateField = (
    id: string,
    patch: {
      status?: WorkItemRow["status"];
      priority?: WorkItemRow["priority"];
      assignedToId?: string;
    },
  ) => {
    startTransition(async () => {
      const res = await updateWorkItemAction({ id, ...patch });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to update");
        router.refresh();
        return;
      }
      const updates: Partial<WorkItemRow> = { ...(patch as Partial<WorkItemRow>) };
      if (patch.assignedToId) {
        const a = assignees.find((x) => x.id === patch.assignedToId);
        if (a) {
          updates.assignedToId = a.id;
          updates.assignedToName = a.name;
          updates.assignedToHandle = a.handle;
          // assignee change resets submission
          updates.submission = null;
          updates.needsReview = false;
        }
      }
      updateLocal(id, updates);
    });
  };

  const removeItem = (id: string) => {
    if (!confirm("Delete this work item? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await deleteWorkItemAction(id);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to delete");
        return;
      }
      setRows((rs) => rs.filter((r) => r.id !== id));
      toast.success("Deleted");
    });
  };

  const accept = (id: string) => {
    startTransition(async () => {
      const res = await acceptWorkItemSubmissionAction(id);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to accept");
        return;
      }
      updateLocal(id, { status: "done", needsReview: false });
      toast.success("Accepted and closed");
    });
  };

  const reopen = (id: string) => {
    startTransition(async () => {
      const res = await reopenWorkItemAction(id);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to reopen");
        return;
      }
      updateLocal(id, {
        status: "in_progress",
        submission: null,
        needsReview: false,
      });
      toast.success("Reopened for assignee");
    });
  };

  return (
    <Card className="border-border/70 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Work items</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {openCount} open · {reviewCount} awaiting review · {rows.length} total
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ New work item"}
          </Button>
        )}
      </div>

      {showCreate && canManage && (
        <CreateWorkItemForm
          assignees={assignees}
          onCreated={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      )}

      <div className="flex flex-wrap gap-1.5">
        {(["open", "review", "all", "done"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={
              "rounded-full border px-3 py-1 text-xs " +
              (filter === k
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:bg-muted/40")
            }
          >
            {k === "open"
              ? "Active"
              : k === "review"
                ? `Review${reviewCount ? ` (${reviewCount})` : ""}`
                : k === "all"
                  ? "All"
                  : "Closed"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          No work items.
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-border/60 bg-card/70 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-snug">
                    {r.title}
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                      {r.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {r.needsReview ? (
                    <Badge tone="accent">Awaiting review</Badge>
                  ) : (
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  )}
                  <Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>
                  By <span className="text-foreground">{r.createdByName}</span>
                </span>
                <span>
                  · Assigned to <span className="text-foreground">{r.assignedToName}</span>
                </span>
                {r.dueAt && (
                  <span>· Due {new Date(r.dueAt).toLocaleDateString()}</span>
                )}
                <span>· {new Date(r.createdAt).toLocaleDateString()}</span>
              </div>

              {r.submission && (
                <div
                  className={
                    "rounded-xl border p-3 space-y-1.5 " +
                    SUBMISSION_RING[r.submission.kind]
                  }
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <span className="inline-grid place-items-center h-5 w-5 rounded-full bg-card text-foreground/80 text-[10px]">
                        ✍
                      </span>
                      <span>
                        {r.assignedToName} marked it{" "}
                        <span className="underline decoration-dotted underline-offset-4">
                          {SUBMISSION_LABEL[r.submission.kind]}
                        </span>
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(r.submission.submittedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-foreground/90 break-words">
                    {r.submission.note}
                  </div>
                </div>
              )}

              {canManage && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                  {r.needsReview && r.submission ? (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => accept(r.id)}
                        className="bg-violet-600 hover:bg-violet-600/90 text-white"
                      >
                        Accept & close
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setReviewId(r.id)}
                        className="border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                      >
                        Request changes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => reopen(r.id)}
                      >
                        Reopen
                      </Button>
                    </>
                  ) : r.status === "done" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => reopen(r.id)}
                    >
                      Reopen
                    </Button>
                  ) : (
                    <>
                      <select
                        value={r.status}
                        disabled={pending}
                        onChange={(e) =>
                          updateField(r.id, {
                            status: e.target.value as WorkItemRow["status"],
                          })
                        }
                        className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                      >
                        {(Object.keys(STATUS_LABEL) as WorkItemRow["status"][]).map((k) => (
                          <option key={k} value={k}>
                            {STATUS_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <select
                        value={r.priority}
                        disabled={pending}
                        onChange={(e) =>
                          updateField(r.id, {
                            priority: e.target.value as WorkItemRow["priority"],
                          })
                        }
                        className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                      <select
                        value={r.assignedToId}
                        disabled={pending}
                        onChange={(e) =>
                          updateField(r.id, { assignedToId: e.target.value })
                        }
                        className="h-8 rounded-lg border border-border bg-card px-2 text-xs"
                      >
                        {assignees.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} (@{a.handle})
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-danger"
                    disabled={pending}
                    onClick={() => removeItem(r.id)}
                  >
                    Delete
                  </Button>
                </div>
              )}

              {/* Request-changes composer */}
              {canManage && reviewId === r.id && r.submission && (
                <RequestChangesDialog
                  id={r.id}
                  onSubmit={async (p) => requestWorkItemChangesAction(p)}
                  onCancel={() => setReviewId(null)}
                  onDone={() => {
                    setReviewId(null);
                    updateLocal(r.id, {
                      submission: null,
                      needsReview: false,
                      status: "in_progress",
                    });
                  }}
                />
              )}

              {/* Activity thread */}
              <details className="group rounded-xl border border-border/50 bg-card/40 overflow-hidden" open={r.needsReview}>
                <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 select-none">
                  <span className="inline-block transition group-open:rotate-90">▸</span>
                  Activity
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-foreground/70">
                    {r.activity?.length ?? 0}
                  </span>
                </summary>
                <div className="p-2.5 space-y-2.5 border-t border-border/40">
                  <ActivityThread
                    entries={r.activity ?? []}
                    workItemId={r.id}
                    myUserId={myUserId}
                    canManage={canManage}
                  />
                  {r.status !== "done" && (
                    <CommentComposer
                      id={r.id}
                      onSend={async (p) => addWorkItemCommentAction(p)}
                    />
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CreateWorkItemForm({
  assignees,
  onCreated,
}: {
  assignees: WorkItemAssignee[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (title.trim().length < 3) {
      toast.error("Title must be at least 3 characters.");
      return;
    }
    if (!assignedToId) {
      toast.error("Pick an assignee — work items must be owned by someone.");
      return;
    }
    startTransition(async () => {
      const res = await createWorkItemAction({
        title: title.trim(),
        description: description.trim(),
        priority,
        assignedToId,
        dueAt: dueAt || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to create");
        return;
      }
      toast.success("Work item created");
      setTitle("");
      setDescription("");
      setPriority("medium");
      setAssignedToId("");
      setDueAt("");
      onCreated();
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Fix prediction lock badge)"
        maxLength={200}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder="Description (optional)"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
        >
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>
        <select
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
          required
          className={
            "h-9 rounded-lg border bg-card px-2 text-xs " +
            (assignedToId ? "border-border" : "border-warning/60")
          }
        >
          <option value="">Assign to… (required)</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} (@{a.handle})
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
        />
        <Button size="sm" onClick={submit} disabled={pending || !assignedToId}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
