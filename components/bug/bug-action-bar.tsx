"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  RotateCcw,
  Megaphone,
  UserPlus,
  Calendar,
  Settings2,
  Trash2,
  ChevronDown,
  AlertOctagon,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RichComposer } from "@/components/ui/rich-composer";
import { useConfirm } from "@/components/ui/use-confirm";
import {
  acceptBugSubmissionAction,
  reopenBugAction,
  requestBugChangesAction,
  setBugDueAction,
  assignBugReportAction,
  updateBugReportAction,
  deleteBugReportAction,
  submitBugResolutionAction,
} from "@/actions/bugs";
import type { BugDetail } from "@/components/bug/bug-detail-panel";

type Assignable = { id: string; handle: string; name: string };

export function BugActionBar({
  bug,
  myUserId,
  canManage,
  assignables,
}: {
  bug: BugDetail;
  myUserId: string;
  canManage: boolean;
  assignables: Assignable[];
}) {
  const [submitOpen, setSubmitOpen] = React.useState<null | "fixed" | "blocked" | "wont_fix">(null);
  const [reqOpen, setReqOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const confirm = useConfirm();

  const isAssignee = bug.assignee && bug.assignee.id === myUserId;
  const closed = bug.status === "resolved" || bug.status === "wont_fix";

  const wrap = (fn: () => Promise<{ ok: boolean; error?: string } | void>) => {
    start(async () => {
      const r = await fn();
      if (r && !r.ok) toast.error(r.error ?? "Action failed");
      else toast.success("Done");
    });
  };

  const acceptClose = async () => {
    const ok = await confirm({
      title: "Accept & close this bug?",
      description: "This will mark the assignee's submission as accepted and close the bug.",
      confirmLabel: "Accept & close",
    });
    if (!ok) return;
    wrap(() => acceptBugSubmissionAction(bug.id));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Admin: submission present */}
        {canManage && bug.submission ? (
          <>
            <Button
              size="sm"
              loading={pending}
              onClick={acceptClose}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Accept & close
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReqOpen((o) => !o)}
            >
              <Megaphone className="h-3.5 w-3.5" />
              Request changes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setReopenOpen((o) => !o)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen
            </Button>
          </>
        ) : null}

        {/* Admin: closed */}
        {canManage && !bug.submission && closed ? (
          <Button size="sm" variant="outline" onClick={() => setReopenOpen((o) => !o)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reopen
          </Button>
        ) : null}

        {/* Admin: open / in_progress, no submission */}
        {canManage && !bug.submission && !closed ? (
          <AssigneePicker
            bugId={bug.id}
            current={bug.assignee?.id ?? null}
            assignables={assignables}
          />
        ) : null}

        {/* Assignee: submit outcome */}
        {!canManage && isAssignee && !bug.submission && !closed ? (
          <>
            <Button size="sm" onClick={() => setSubmitOpen("fixed")}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark fixed
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSubmitOpen("blocked")}>
              <AlertOctagon className="h-3.5 w-3.5" />
              Blocked
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSubmitOpen("wont_fix")}>
              <XCircle className="h-3.5 w-3.5" />
              Not a bug
            </Button>
          </>
        ) : null}

        {/* Admin: more menu (always) */}
        {canManage ? (
          <div className="relative ml-auto">
            <Button size="sm" variant="ghost" onClick={() => setMoreOpen((o) => !o)}>
              <Settings2 className="h-3.5 w-3.5" />
              More
              <ChevronDown className={cn("h-3 w-3 transition", moreOpen && "rotate-180")} />
            </Button>
            {moreOpen ? (
              <MoreMenu bug={bug} onClose={() => setMoreOpen(false)} />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Inline composers */}
      {submitOpen ? (
        <RichComposer
          autoFocus
          submitLabel={`Submit "${submitOpen === "fixed" ? "Fixed" : submitOpen === "blocked" ? "Blocked" : "Not a bug"}"`}
          placeholder={
            submitOpen === "fixed"
              ? "What did you change? Mention root cause + how to test."
              : submitOpen === "blocked"
                ? "What's blocking you? Who needs to unblock?"
                : "Why is this not a bug?"
          }
          onCancel={() => setSubmitOpen(null)}
          onSubmit={async (text) => {
            const r = await submitBugResolutionAction({
              id: bug.id,
              kind: submitOpen,
              note: text,
            });
            if (r.ok) {
              setSubmitOpen(null);
              toast.success("Submitted — awaiting admin review");
            }
            return r;
          }}
        />
      ) : null}

      {reqOpen ? (
        <RichComposer
          autoFocus
          submitLabel="Request changes"
          placeholder="Tell the assignee exactly what to change…"
          onCancel={() => setReqOpen(false)}
          onSubmit={async (text) => {
            const r = await requestBugChangesAction({ id: bug.id, note: text });
            if (r.ok) {
              setReqOpen(false);
              toast.success("Changes requested");
            }
            return r;
          }}
        />
      ) : null}

      {reopenOpen ? (
        <RichComposer
          autoFocus
          submitLabel="Reopen"
          placeholder="Why are you reopening? (optional)"
          onCancel={() => setReopenOpen(false)}
          onSubmit={async (text) => {
            const r = await reopenBugAction({
              id: bug.id,
              reason: text || undefined,
              keepAssignee: !!bug.assignee,
            });
            if (r.ok) {
              setReopenOpen(false);
              toast.success("Reopened");
            }
            return r;
          }}
        />
      ) : null}
    </div>
  );
}

function MoreMenu({ bug, onClose }: { bug: BugDetail; onClose: () => void }) {
  const confirm = useConfirm();
  const wrap = (
    cb: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string,
  ) => async () => {
    onClose();
    const r = await cb();
    if (r.ok) toast.success(successMsg);
    else toast.error(r.error ?? "Failed");
  };
  return (
    <div
      role="menu"
      className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-popover text-[12.5px] shadow-2xl"
      onMouseLeave={onClose}
    >
      <DueDateRow bug={bug} onDone={onClose} />
      <StatusOverrideRow bug={bug} onDone={onClose} />
      {bug.assignee ? (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
          onClick={async () => {
            onClose();
            const ok = await confirm({
              title: `Unassign ${bug.assignee?.name ?? "this person"}?`,
              description: "They will no longer be responsible for this bug.",
              confirmLabel: "Unassign",
            });
            if (!ok) return;
            const r = await assignBugReportAction({ id: bug.id, userId: null });
            if (r.ok) toast.success("Unassigned");
            else toast.error(r.error ?? "Failed");
          }}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Unassign
        </button>
      ) : null}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
        onClick={async () => {
          onClose();
          const ok = await confirm({
            title: "Delete this bug?",
            description: "All comments, attachments, and history will be lost. This cannot be undone.",
            confirmLabel: "Delete",
            tone: "danger",
          });
          if (!ok) return;
          const r = await deleteBugReportAction(bug.id);
          if (r.ok) {
            toast.success("Deleted");
            window.location.href = "/developer";
          } else toast.error(r.error ?? "Failed");
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete bug
      </button>
    </div>
  );
}

function DueDateRow({ bug, onDone }: { bug: BugDetail; onDone: () => void }) {
  const [val, setVal] = React.useState(() =>
    bug.dueAt ? new Date(bug.dueAt).toISOString().slice(0, 10) : "",
  );
  const save = async () => {
    const iso = val ? new Date(val + "T17:00:00Z").toISOString() : null;
    const r = await setBugDueAction({ id: bug.id, dueAt: iso });
    if (r.ok) toast.success(iso ? "Due date set" : "Due date cleared");
    else toast.error(r.error ?? "Failed");
    onDone();
  };
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      <input
        type="date"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="flex-1 rounded-md border border-border/60 bg-background px-1.5 py-1 text-[12px] outline-none focus:border-primary"
      />
      <button
        type="button"
        onClick={save}
        className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
      >
        Set
      </button>
    </div>
  );
}

function StatusOverrideRow({ bug, onDone }: { bug: BugDetail; onDone: () => void }) {
  const [val, setVal] = React.useState(bug.status);
  const confirm = useConfirm();
  const save = async () => {
    if (val === bug.status) {
      onDone();
      return;
    }
    const ok = await confirm({
      title: `Change status to "${val}"?`,
      description: "This overrides the normal workflow. Use carefully.",
      confirmLabel: "Change status",
    });
    if (!ok) {
      onDone();
      return;
    }
    const r = await updateBugReportAction({ id: bug.id, status: val });
    if (r.ok) toast.success("Status updated");
    else toast.error(r.error ?? "Failed");
    onDone();
  };
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
      <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={val}
        onChange={(e) => setVal(e.target.value as BugDetail["status"])}
        className="flex-1 rounded-md border border-border/60 bg-background px-1.5 py-1 text-[12px] outline-none focus:border-primary"
      >
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
        <option value="wont_fix">Won&apos;t fix</option>
      </select>
      <button
        type="button"
        onClick={save}
        className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
      >
        Set
      </button>
    </div>
  );
}

function AssigneePicker({
  bugId,
  current,
  assignables,
}: {
  bugId: string;
  current: string | null;
  assignables: Assignable[];
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const filtered = React.useMemo(
    () =>
      assignables.filter(
        (u) =>
          u.handle.toLowerCase().includes(q.toLowerCase()) ||
          u.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [assignables, q],
  );
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
        <UserPlus className="h-3.5 w-3.5" />
        {current ? "Reassign" : "Assign"}
      </Button>
      {open ? (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          onMouseLeave={() => setOpen(false)}
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find teammate…"
            className="block w-full border-b border-border/40 bg-transparent px-3 py-2 text-[12px] outline-none"
          />
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={async () => {
                  setOpen(false);
                  const r = await assignBugReportAction({ id: bugId, userId: u.id });
                  if (r.ok) toast.success(`Assigned to ${u.name}`);
                  else toast.error(r.error ?? "Failed");
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-muted",
                  u.id === current && "bg-primary/10 text-primary",
                )}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[9.5px] font-bold">
                  {u.name[0]?.toUpperCase()}
                </span>
                <span className="font-medium">{u.name}</span>
                <span className="text-muted-foreground">@{u.handle}</span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No matches</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
