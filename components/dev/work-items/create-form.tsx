/**
 * Compact "New work item" form. Lives inline at the top of the panel for
 * managers. Title + description are required; everything else (priority,
 * assignee, due, points, tags) has sensible defaults so quick capture stays
 * one-keystroke fast.
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createWorkItemAction } from "@/actions/work-items";
import { PRIORITY_META, PRIORITY_ORDER, POINTS_OPTIONS } from "./util";
import type { Priority, WorkItemAssignee } from "./types";

export function CreateForm({
  assignees,
}: {
  assignees: WorkItemAssignee[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assignedToId, setAssignedToId] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");
  const [points, setPoints] = useState<string>("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [pending, start] = useTransition();

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssignedToId("");
    setDueAt("");
    setPoints("");
    setTagsRaw("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !assignedToId) {
      toast.error("Title, description and assignee are required");
      return;
    }
    const tags = tagsRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    start(async () => {
      const res = await createWorkItemAction({
        title: title.trim(),
        description: description.trim(),
        priority,
        assignedToId,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        tags,
        storyPoints: points ? Number(points) : null,
      });
      if (!res || res.ok === false) {
        toast.error(res?.error ?? "Could not create work item");
        return;
      }
      toast.success("Work item created");
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 h-9 text-xs font-semibold text-primary hover:bg-primary/20"
      >
        <Plus className="h-3.5 w-3.5" />
        New
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-t-2xl border border-border/60 bg-card shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold">New work item</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted/50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <form onSubmit={onSubmit} className="space-y-3 px-4 py-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary…"
              maxLength={200}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What needs to be done? Acceptance criteria, links, screenshots…"
              maxLength={4000}
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Assignee
              </label>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Priority
              </label>
              <div className="flex gap-1">
                {PRIORITY_ORDER.map((p) => {
                  const m = PRIORITY_META[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={
                        "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition " +
                        (priority === p
                          ? m.chip + " ring-1 ring-current/40"
                          : "border-border/60 text-muted-foreground hover:bg-muted/30")
                      }
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Due
              </label>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Story points
              </label>
              <select
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {POINTS_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tags
            </label>
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="ui, perf, hotfix"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Comma or space separated · max 12 · lowercased
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
