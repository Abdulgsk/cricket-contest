"use client";

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
} from "lucide-react";
import { useConfirm } from "@/components/ui/use-confirm";
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
};

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

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-grid place-items-center rounded-full bg-primary/15 text-primary font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}

const SUBMISSION_TONE: Record<
  string,
  { label: string; tone: string; ring: string; Icon: typeof CheckCircle2 }
> = {
  // bug kinds
  fixed: {
    label: "Marked as Fixed",
    tone: "text-emerald-700 dark:text-emerald-300",
    ring: "border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/5",
    Icon: CheckCircle2,
  },
  blocked: {
    label: "Marked as Blocked",
    tone: "text-amber-700 dark:text-amber-300",
    ring: "border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5",
    Icon: AlertOctagon,
  },
  wont_fix: {
    label: "Marked as Won't fix",
    tone: "text-rose-700 dark:text-rose-300",
    ring: "border-rose-500/30 bg-rose-500/10 dark:bg-rose-500/5",
    Icon: XCircle,
  },
  // work-item kinds
  done: {
    label: "Marked as Done",
    tone: "text-emerald-700 dark:text-emerald-300",
    ring: "border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/5",
    Icon: CheckCircle2,
  },
  wont_do: {
    label: "Marked as Won't do",
    tone: "text-rose-700 dark:text-rose-300",
    ring: "border-rose-500/30 bg-rose-500/10 dark:bg-rose-500/5",
    Icon: XCircle,
  },
};

function SystemRow({
  Icon,
  tone,
  text,
}: {
  Icon: typeof CheckCircle2;
  tone: string;
  text: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2 text-[11px] ${tone}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  );
}

export function ActivityThread({
  entries,
  workItemId,
  myUserId,
  canManage,
}: {
  entries: ActivityEntry[];
  /** When set, comment rows get a delete menu (work-item context). */
  workItemId?: string;
  myUserId?: string;
  canManage?: boolean;
}) {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        No activity yet — be the first to comment.
      </div>
    );
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  return (
    <ol className="space-y-2.5">
      {sorted.map((e, i) => {
        const key = e._id ?? `${e.at}-${i}`;
        const when = relTime(e.at);

        if (e.kind === "comment") {
          return (
            <CommentRow
              key={key}
              entry={e}
              when={when}
              workItemId={workItemId}
              myUserId={myUserId}
              canManage={!!canManage}
            />
          );
        }

        if (e.kind === "submission") {
          const subKind = String(e.meta?.kind ?? "");
          const meta = SUBMISSION_TONE[subKind];
          const Icon = meta?.Icon ?? CheckCircle2;
          return (
            <li key={key} className="flex items-start gap-2.5">
              <Avatar name={e.byName} size={28} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-semibold text-foreground">{e.byName}</span>
                  <span className="text-muted-foreground">submitted · {when}</span>
                </div>
                <div
                  className={`rounded-2xl border p-2.5 ${meta?.ring ?? "border-border bg-card"}`}
                >
                  <div
                    className={`flex items-center gap-1.5 text-xs font-semibold ${meta?.tone ?? ""}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta?.label ?? `Submitted: ${subKind}`}
                  </div>
                  {e.text ? (
                    <div className="mt-1 whitespace-pre-wrap text-sm text-foreground/90 break-words">
                      {e.text}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        }

        if (e.kind === "request_changes") {
          return (
            <li key={key} className="flex items-start gap-2.5">
              <Avatar name={e.byName} size={28} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-semibold text-foreground">{e.byName}</span>
                  <span className="text-muted-foreground">requested changes · {when}</span>
                </div>
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    <Megaphone className="h-3.5 w-3.5" />
                    Changes requested
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-foreground/90 break-words">
                    {e.text}
                  </div>
                </div>
              </div>
            </li>
          );
        }

        // System rows (no chat bubble, just a thin line item)
        const systemRow = (() => {
          if (e.kind === "accept") {
            const closedStatus = String(e.meta?.closedStatus ?? "");
            return (
              <SystemRow
                Icon={CheckCircle2}
                tone="text-emerald-700 dark:text-emerald-300"
                text={
                  <>
                    <strong className="font-medium">{e.byName}</strong> accepted &amp; closed
                    {closedStatus ? ` as ${closedStatus}` : ""} · {when}
                  </>
                }
              />
            );
          }
          if (e.kind === "reopen") {
            return (
              <SystemRow
                Icon={RotateCcw}
                tone="text-muted-foreground"
                text={
                  <>
                    <strong className="font-medium text-foreground">{e.byName}</strong>{" "}
                    reopened {e.text ? <em>— “{e.text}”</em> : null} · {when}
                  </>
                }
              />
            );
          }
          if (e.kind === "assignment_change") {
            const assigneeName = e.meta?.assigneeName as string | undefined;
            const unassigned = Boolean(e.meta?.unassigned);
            return (
              <SystemRow
                Icon={UserCog}
                tone="text-muted-foreground"
                text={
                  <>
                    <strong className="font-medium text-foreground">{e.byName}</strong>{" "}
                    {unassigned
                      ? "unassigned"
                      : assigneeName
                        ? `assigned to ${assigneeName}`
                        : "changed the assignee"}
                    {e.text ? <em> — “{e.text}”</em> : null} · {when}
                  </>
                }
              />
            );
          }
          if (e.kind === "status_change") {
            const from = String(e.meta?.from ?? "");
            const to = String(e.meta?.to ?? "");
            return (
              <SystemRow
                Icon={RefreshCcw}
                tone="text-muted-foreground"
                text={
                  <>
                    <strong className="font-medium text-foreground">{e.byName}</strong>{" "}
                    changed status {from} <ArrowRight className="inline h-3 w-3" /> {to} ·{" "}
                    {when}
                  </>
                }
              />
            );
          }
          return null;
        })();

        return systemRow ? (
          <li key={key} className="pl-9">
            {systemRow}
          </li>
        ) : (
          <li key={key} className="pl-9 text-[11px] text-muted-foreground">
            <MessageSquare className="inline h-3 w-3 mr-1" />
            {e.byName} · {when}
          </li>
        );
      })}
    </ol>
  );
}

function CommentRow({
  entry,
  when,
  workItemId,
  myUserId,
  canManage,
}: {
  entry: ActivityEntry;
  when: string;
  workItemId?: string;
  myUserId?: string;
  canManage: boolean;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const confirm = useConfirm();
  const isMine = myUserId && entry.byId && String(entry.byId) === String(myUserId);
  const canDelete = workItemId && entry._id && (isMine || canManage);

  return (
    <li className="group flex items-start gap-2.5">
      <Avatar name={entry.byName} size={28} />
      <div className="min-w-0 flex-1 rounded-2xl border border-border/60 bg-card/60 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] mb-0.5">
          <span className="font-semibold text-foreground">{entry.byName}</span>
          <span className="text-muted-foreground">@{entry.byHandle}</span>
          <span className="text-muted-foreground">· {when}</span>
          {canDelete ? (
            <div className="relative ml-auto opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="More"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-lg border border-border bg-popover text-[12px] shadow-xl"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <button
                    type="button"
                    disabled={pending}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-rose-700 hover:bg-rose-500/10 dark:text-rose-300 disabled:opacity-50"
                    onClick={() => {
                      setMenuOpen(false);
                      start(async () => {
                        const ok = await confirm({
                          title: "Delete this comment?",
                          description: "It will disappear for everyone.",
                          confirmLabel: "Delete",
                          tone: "danger",
                        });
                        if (!ok) return;
                        const r = await deleteWorkItemCommentAction({
                          id: workItemId,
                          activityId: entry._id!,
                        });
                        if (!r.ok) toast.error(r.error ?? "Failed to delete");
                        else toast.success("Comment deleted");
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="whitespace-pre-wrap text-sm text-foreground/90 break-words">
          {entry.text}
        </div>
      </div>
    </li>
  );
}
