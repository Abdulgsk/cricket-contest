"use client";

/**
 * Enterprise-style activity timeline used by bug reports & work items.
 *
 * Layout:
 *   ▸ Left rail = vertical line + per-event "node" (avatar for comments &
 *     submissions, icon disc for system events).
 *   ▸ Right column = bubble (for comments/submissions/request-changes) or a
 *     compact inline phrase (for status / assignment / accept / reopen).
 *   ▸ Day separators ("Today", "Yesterday", "12 Jun") split chronologically
 *     sorted entries so long threads stay legible.
 *   ▸ Status changes render real status *chips* — not raw strings — so
 *     `open → in_progress` looks like first-class state, not log output.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertOctagon,
  XCircle,
  MessageSquare,
  RotateCcw,
  RefreshCcw,
  UserCog,
  ArrowRight,
  Megaphone,
  MoreHorizontal,
  Trash2,
  Copy,
  CalendarDays,
  Tag as TagIcon,
  CheckSquare,
  Paperclip,
  Hash,
} from "lucide-react";
import { useConfirm } from "@/components/ui/use-confirm";
import { MessageMenu, type MessageMenuItem } from "@/components/ui/message-menu";
import { deleteWorkItemCommentAction } from "@/actions/work-items";

export type ActivityKind =
  | "comment"
  | "submission"
  | "request_changes"
  | "accept"
  | "reopen"
  | "assignment_change"
  | "status_change"
  | "due_change"
  | "tag_change"
  | "subtask_change"
  | "attachment_change"
  | "points_change"
  | "system";

export type ActivityEntry = {
  _id?: string;
  at: string; // ISO
  byId: string | null;
  byName: string;
  byHandle: string;
  kind: ActivityKind;
  text?: string;
  meta?: Record<string, unknown> | null;
  deletedAt?: string | null;
  deletedByName?: string | null;
  deletedByHandle?: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function relTime(iso: string): string {
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

function exactTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function dayBucket(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOfDay = (x: Date) => {
    const c = new Date(x);
    c.setHours(0, 0, 0, 0);
    return c.getTime();
  };
  const diffDays = Math.round(
    (startOfDay(today) - startOfDay(d)) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)
    return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
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

/** Coloured icon disc used as a timeline node for system events. */
function NodeDisc({
  Icon,
  tone,
  size = 28,
}: {
  Icon: typeof CheckCircle2;
  tone: string;
  size?: number;
}) {
  return (
    <span
      className={
        "inline-grid place-items-center rounded-full ring-2 ring-card shrink-0 " +
        tone
      }
      style={{ width: size, height: size }}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/** Status chip shared by bug + work-item status enums. */
const STATUS_CHIP: Record<string, { label: string; chip: string }> = {
  open: {
    label: "Open",
    chip: "bg-primary/10 text-primary border-primary/25",
  },
  in_progress: {
    label: "In progress",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  blocked: {
    label: "Blocked",
    chip: "bg-amber-400/10 text-amber-800 dark:text-amber-200 border-amber-500/25",
  },
  done: {
    label: "Done",
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
  },
  resolved: {
    label: "Resolved",
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
  },
  wont_fix: {
    label: "Won't fix",
    chip: "bg-muted/60 text-muted-foreground border-border/60",
  },
};

function StatusChip({ value }: { value: string }) {
  const meta = STATUS_CHIP[value] ?? {
    label: value,
    chip: "bg-muted/60 text-muted-foreground border-border/60",
  };
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium " +
        meta.chip
      }
    >
      {meta.label}
    </span>
  );
}

/** Submission kind tokens, matching the SubmissionPanel in card surfaces. */
const SUBMISSION_META: Record<
  string,
  { label: string; tone: string; ring: string; node: string; Icon: typeof CheckCircle2 }
> = {
  fixed: {
    label: "Marked as Fixed",
    tone: "text-violet-700 dark:text-violet-300",
    ring: "border-violet-500/25 bg-violet-500/[0.06] dark:bg-violet-500/[0.08]",
    node: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    Icon: CheckCircle2,
  },
  blocked: {
    label: "Marked as Blocked",
    tone: "text-amber-800 dark:text-amber-200",
    ring: "border-amber-500/25 bg-amber-400/[0.06] dark:bg-amber-500/[0.08]",
    node: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    Icon: AlertOctagon,
  },
  wont_fix: {
    label: "Marked as Not a bug",
    tone: "text-rose-700 dark:text-rose-300",
    ring: "border-rose-500/25 bg-rose-500/[0.06] dark:bg-rose-500/[0.08]",
    node: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    Icon: XCircle,
  },
  done: {
    label: "Marked as Done",
    tone: "text-violet-700 dark:text-violet-300",
    ring: "border-violet-500/25 bg-violet-500/[0.06] dark:bg-violet-500/[0.08]",
    node: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    Icon: CheckCircle2,
  },
  wont_do: {
    label: "Marked as Won't do",
    tone: "text-rose-700 dark:text-rose-300",
    ring: "border-rose-500/25 bg-rose-500/[0.06] dark:bg-rose-500/[0.08]",
    node: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    Icon: XCircle,
  },
};

/* -------------------------------------------------------------------------- */
/*  Root                                                                       */
/* -------------------------------------------------------------------------- */

export function ActivityThread({
  entries,
  workItemId,
  myUserId,
  canManage,
}: {
  entries: ActivityEntry[];
  workItemId?: string;
  myUserId?: string;
  canManage?: boolean;
}) {
  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center">
        <MessageSquare className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground/60" />
        <div className="text-xs text-muted-foreground">No activity yet.</div>
        <div className="text-[11px] text-muted-foreground/70">
          Status changes and replies will appear here.
        </div>
      </div>
    );
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  // Group by day bucket so we can render headers between groups.
  const groups: { day: string; items: ActivityEntry[] }[] = [];
  for (const e of sorted) {
    const day = dayBucket(e.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div className="relative">
      {/* Vertical rail. Sits behind nodes; insets so it ends cleanly. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[13px] top-2 bottom-2 w-px bg-border/60"
      />
      <ol className="relative space-y-3">
        {groups.map((g, gi) => (
          <li key={g.day + gi} className="space-y-2.5">
            <DayHeader label={g.day} />
            <ol className="space-y-2.5">
              {g.items.map((e, i) => (
                <ActivityRow
                  key={e._id ?? `${e.at}-${i}`}
                  entry={e}
                  workItemId={workItemId}
                  myUserId={myUserId}
                  canManage={!!canManage}
                />
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DayHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pl-9">
      <span className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border/40" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row dispatcher                                                             */
/* -------------------------------------------------------------------------- */

function ActivityRow({
  entry,
  workItemId,
  myUserId,
  canManage,
}: {
  entry: ActivityEntry;
  workItemId?: string;
  myUserId?: string;
  canManage: boolean;
}) {
  const when = relTime(entry.at);
  const tip = exactTime(entry.at);

  if (entry.kind === "comment") {
    return (
      <CommentRow
        entry={entry}
        when={when}
        tip={tip}
        workItemId={workItemId}
        myUserId={myUserId}
        canManage={canManage}
      />
    );
  }

  if (entry.kind === "submission") {
    const subKind = String(entry.meta?.kind ?? "");
    const meta = SUBMISSION_META[subKind] ?? SUBMISSION_META.fixed;
    const Icon = meta.Icon;
    return (
      <li className="relative flex items-start gap-2.5">
        <NodeDisc Icon={Icon} tone={meta.node} />
        <div className="min-w-0 flex-1 space-y-1">
          <RowMeta name={entry.byName} action="submitted an update" when={when} tip={tip} />
          <div className={`rounded-2xl border p-3 ${meta.ring}`}>
            <div
              className={`flex items-center gap-1.5 text-xs font-semibold ${meta.tone}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </div>
            {entry.text ? (
              <div className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90 break-words">
                {entry.text}
              </div>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  if (entry.kind === "request_changes") {
    return (
      <li className="relative flex items-start gap-2.5">
        <NodeDisc
          Icon={Megaphone}
          tone="bg-amber-500/15 text-amber-700 dark:text-amber-300"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <RowMeta name={entry.byName} action="requested changes" when={when} tip={tip} />
          <div className="rounded-2xl border border-amber-500/25 bg-amber-400/[0.06] dark:bg-amber-500/[0.08] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
              <Megaphone className="h-3.5 w-3.5" />
              Changes requested
            </div>
            {entry.text ? (
              <div className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90 break-words">
                {entry.text}
              </div>
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  if (entry.kind === "accept") {
    const closedStatus = String(entry.meta?.closedStatus ?? "");
    return (
      <SystemRow
        Icon={CheckCircle2}
        nodeTone="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        when={when}
        tip={tip}
      >
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        <span className="text-muted-foreground">accepted &amp; closed</span>
        {closedStatus ? (
          <>
            {" "}
            <span className="text-muted-foreground">as</span>{" "}
            <StatusChip value={closedStatus} />
          </>
        ) : null}
      </SystemRow>
    );
  }

  if (entry.kind === "reopen") {
    return (
      <SystemRow
        Icon={RotateCcw}
        nodeTone="bg-muted text-muted-foreground"
        when={when}
        tip={tip}
      >
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        <span className="text-muted-foreground">reopened the item</span>
        {entry.text ? (
          <span className="text-muted-foreground italic"> — “{entry.text}”</span>
        ) : null}
      </SystemRow>
    );
  }

  if (entry.kind === "assignment_change") {
    const assigneeName = entry.meta?.assigneeName as string | undefined;
    const unassigned = Boolean(entry.meta?.unassigned);
    return (
      <SystemRow
        Icon={UserCog}
        nodeTone="bg-sky-500/15 text-sky-700 dark:text-sky-300"
        when={when}
        tip={tip}
      >
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        {unassigned ? (
          <span className="text-muted-foreground">unassigned the item</span>
        ) : assigneeName ? (
          <>
            <span className="text-muted-foreground">assigned to</span>{" "}
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
              <Avatar name={assigneeName} size={14} />
              {assigneeName}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">changed the assignee</span>
        )}
        {entry.text ? (
          <span className="text-muted-foreground italic"> — “{entry.text}”</span>
        ) : null}
      </SystemRow>
    );
  }

  if (entry.kind === "status_change") {
    const from = String(entry.meta?.from ?? "");
    const to = String(entry.meta?.to ?? "");
    return (
      <SystemRow
        Icon={RefreshCcw}
        nodeTone="bg-muted text-muted-foreground"
        when={when}
        tip={tip}
      >
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        <span className="text-muted-foreground">moved status</span>{" "}
        <StatusChip value={from} />
        <ArrowRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" />
        <StatusChip value={to} />
      </SystemRow>
    );
  }

  if (entry.kind === "due_change") {
    const to = entry.meta?.to as string | undefined;
    return (
      <SystemRow
        Icon={CalendarDays}
        nodeTone="bg-muted text-muted-foreground"
        when={when}
        tip={tip}
      >
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        <span className="text-muted-foreground">
          {to ? "set due date to" : "cleared the due date"}
        </span>{" "}
        {to ? (
          <span className="rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
            {new Date(to).toLocaleDateString()}
          </span>
        ) : null}
      </SystemRow>
    );
  }

  if (entry.kind === "tag_change") {
    const added = (entry.meta?.added as string[]) ?? [];
    const removed = (entry.meta?.removed as string[]) ?? [];
    return (
      <SystemRow Icon={TagIcon} nodeTone="bg-muted text-muted-foreground" when={when} tip={tip}>
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        <span className="text-muted-foreground">updated tags</span>
        {added.length > 0 && (
          <span className="ml-1 text-emerald-700 dark:text-emerald-300">
            +{added.join(", ")}
          </span>
        )}
        {removed.length > 0 && (
          <span className="ml-1 text-rose-700 dark:text-rose-300">
            −{removed.join(", ")}
          </span>
        )}
      </SystemRow>
    );
  }

  if (entry.kind === "subtask_change") {
    const op = String(entry.meta?.op ?? "");
    const text = String(entry.meta?.text ?? "");
    const verb =
      op === "add" ? "added subtask" : op === "remove" ? "removed subtask" : op === "done" ? "checked off" : "unchecked";
    return (
      <SystemRow Icon={CheckSquare} nodeTone="bg-muted text-muted-foreground" when={when} tip={tip}>
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        <span className="text-muted-foreground">{verb}</span>
        {text && <span className="ml-1 italic text-foreground/80">“{text}”</span>}
      </SystemRow>
    );
  }

  if (entry.kind === "attachment_change") {
    const op = String(entry.meta?.op ?? "");
    const name = String(entry.meta?.name ?? "");
    return (
      <SystemRow Icon={Paperclip} nodeTone="bg-muted text-muted-foreground" when={when} tip={tip}>
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        <span className="text-muted-foreground">
          {op === "add" ? "attached" : "removed"}
        </span>
        {name && <span className="ml-1 text-foreground/80">{name}</span>}
      </SystemRow>
    );
  }

  if (entry.kind === "points_change") {
    const to = entry.meta?.to;
    return (
      <SystemRow Icon={Hash} nodeTone="bg-muted text-muted-foreground" when={when} tip={tip}>
        <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
        <span className="text-muted-foreground">
          {to == null ? "cleared story points" : `set story points to ${String(to)}`}
        </span>
      </SystemRow>
    );
  }

  // Fallback
  return (
    <SystemRow
      Icon={MessageSquare}
      nodeTone="bg-muted text-muted-foreground"
      when={when}
      tip={tip}
    >
      <strong className="font-semibold text-foreground">{entry.byName}</strong>{" "}
      <span className="text-muted-foreground">{entry.kind}</span>
    </SystemRow>
  );
}

function RowMeta({
  name,
  action,
  when,
  tip,
}: {
  name: string;
  action: string;
  when: string;
  tip: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-[11px]">
      <span className="font-semibold text-foreground">{name}</span>
      <span className="text-muted-foreground">{action}</span>
      <span className="text-muted-foreground/70">·</span>
      <span className="text-muted-foreground" title={tip} suppressHydrationWarning>
        {when}
      </span>
    </div>
  );
}

function SystemRow({
  Icon,
  nodeTone,
  when,
  tip,
  children,
}: {
  Icon: typeof CheckCircle2;
  nodeTone: string;
  when: string;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex items-center gap-2.5">
      <NodeDisc Icon={Icon} tone={nodeTone} />
      <div className="min-w-0 flex-1 text-[12px] leading-snug">
        {children}
        <span className="text-muted-foreground/70"> · </span>
        <span className="text-muted-foreground text-[11px]" title={tip} suppressHydrationWarning>
          {when}
        </span>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Comment row                                                                */
/* -------------------------------------------------------------------------- */

function CommentRow({
  entry,
  when,
  tip,
  workItemId,
  myUserId,
  canManage,
}: {
  entry: ActivityEntry;
  when: string;
  tip: string;
  workItemId?: string;
  myUserId?: string;
  canManage: boolean;
}) {
  const [pending, start] = React.useTransition();
  const confirm = useConfirm();
  const isMine = myUserId && entry.byId && String(entry.byId) === String(myUserId);
  const isDeleted = !!entry.deletedAt;
  const canDelete = !isDeleted && !!(workItemId && entry._id && isMine);

  const onDelete = () => {
    if (!canDelete) return;
    start(async () => {
      const ok = await confirm({
        title: "Delete this comment?",
        description: "It will disappear for everyone.",
        confirmLabel: "Delete",
        tone: "danger",
      });
      if (!ok) return;
      const r = await deleteWorkItemCommentAction({
        id: workItemId!,
        activityId: entry._id!,
      });
      if (!r.ok) toast.error(r.error ?? "Failed to delete");
      else toast.success("Comment deleted");
    });
  };

  const menuItems: MessageMenuItem[] = [];
  if (!isDeleted && entry.text) {
    menuItems.push({
      label: "Copy text",
      icon: Copy,
      onSelect: () =>
        navigator.clipboard?.writeText(entry.text ?? "").then(
          () => toast.success("Copied"),
          () => toast.error("Couldn\u2019t copy"),
        ),
    });
  }
  if (canDelete) {
    menuItems.push({ label: "Delete", icon: Trash2, onSelect: onDelete, danger: true });
  }

  if (isDeleted) {
    return (
      <li className="relative flex items-start gap-2.5">
        <Avatar name={entry.byName} size={28} />
        <div className="min-w-0 flex-1 rounded-2xl border border-dashed border-border/60 bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] mb-0.5">
            <span className="font-semibold text-foreground">{entry.byName}</span>
            <span className="text-muted-foreground">@{entry.byHandle}</span>
            <span className="text-muted-foreground">· {when}</span>
          </div>
          <div className="text-[12.5px] italic text-muted-foreground">
            This message was deleted
            {entry.deletedByHandle && entry.deletedByHandle !== entry.byHandle
              ? ` by @${entry.deletedByHandle}`
              : ""}
            .
          </div>
        </div>
      </li>
    );
  }

  return (
    <MessageMenu
      items={menuItems}
      as="li"
      className={
        "group relative flex items-start gap-2.5 " + (isMine ? "" : "")
      }
    >
      <Avatar name={entry.byName} size={28} />
      <div
        className={
          "min-w-0 flex-1 rounded-2xl border px-3.5 py-2.5 shadow-sm transition " +
          (isMine
            ? "border-primary/30 bg-primary/[0.04]"
            : "border-border/60 bg-card/70 hover:border-border")
        }
      >
        <div className="flex items-center gap-2 text-[11px] mb-1">
          <span className="font-semibold text-foreground">{entry.byName}</span>
          <span className="text-muted-foreground">@{entry.byHandle}</span>
          <span className="text-muted-foreground/70">·</span>
          <span className="text-muted-foreground" title={tip} suppressHydrationWarning>
            {when}
          </span>
          {isMine && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
              You
            </span>
          )}
          {menuItems.length > 0 ? (
            <MessageMenu
              items={menuItems}
              className="relative ml-auto opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
              renderTrigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  disabled={pending}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label="More"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            />
          ) : null}
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 break-words">
          {entry.text}
        </div>
      </div>
    </MessageMenu>
  );
}
