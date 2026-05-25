"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertOctagon,
  XCircle,
  MessageSquare,
  RotateCcw,
  UserCog,
  ArrowRight,
  Megaphone,
  Calendar,
  Filter,
  Pencil,
  Trash2,
  Copy,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownLite } from "@/components/ui/markdown";
import { ReactionsBar, groupReactions } from "@/components/ui/reactions-bar";
import { RichComposer } from "@/components/ui/rich-composer";
import { useConfirm } from "@/components/ui/use-confirm";
import { MessageMenu, type MessageMenuItem } from "@/components/ui/message-menu";
import { useLocaleTitle } from "@/lib/use-locale-title";
import { colorFromString, initials, relTimeLong } from "@/lib/bug-format";
import {
  editBugCommentAction,
  deleteBugCommentAction,
} from "@/actions/bugs";

export type BugThreadEntry = {
  _id: string;
  at: string;
  byId: string | null;
  byName: string;
  byHandle: string;
  kind:
    | "comment"
    | "submission"
    | "request_changes"
    | "accept"
    | "reopen"
    | "assignment_change"
    | "status_change"
    | "due_change"
    | "system";
  text?: string;
  editedAt?: string | null;
  meta?: Record<string, unknown> | null;
  mentions?: Array<{ userId: string; handle: string; name: string }>;
  reactions?: Array<{ emoji: string; byId: string; byHandle: string; byName: string }>;
  /** Soft-delete: when present, render a tombstone and lock the row. */
  deletedAt?: string | null;
  deletedByName?: string | null;
  deletedByHandle?: string | null;
};

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const c = colorFromString(name || "?");
  return (
    <span
      className="inline-grid place-items-center rounded-full font-semibold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: c.bg,
        color: c.fg,
      }}
      title={name}
    >
      {initials(name) || "?"}
    </span>
  );
}

function CommentRow({
  e,
  bugId,
  myUserId,
  isMine,
  canManage,
}: {
  e: BugThreadEntry;
  bugId: string;
  myUserId: string;
  isMine: boolean;
  canManage: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const reactions = groupReactions(e.reactions ?? []);
  const confirm = useConfirm();
  const router = useRouter();
  const atTitle = useLocaleTitle(e.at);
  const editedTitle = useLocaleTitle(e.editedAt);
  const isDeleted = !!e.deletedAt;

  const onDelete = async () => {
    if (!isMine) return;
    const ok = await confirm({
      title: "Delete this comment?",
      description: "It will disappear for everyone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const r = await deleteBugCommentAction({ bugId, activityId: e._id });
    if (!r.ok) {
      toast.error(r.error ?? "Failed to delete");
      return;
    }
    router.refresh();
  };

  const menuItems: MessageMenuItem[] = [];
  if (!isDeleted && e.text) {
    menuItems.push({
      label: "Copy text",
      icon: Copy,
      onSelect: () => {
        navigator.clipboard?.writeText(e.text ?? "").then(
          () => toast.success("Copied"),
          () => toast.error("Couldn’t copy"),
        );
      },
    });
  }
  if (!isDeleted && isMine) {
    menuItems.push({ label: "Edit", icon: Pencil, onSelect: () => setEditing(true) });
  }
  if (!isDeleted && isMine) {
    menuItems.push({ label: "Delete", icon: Trash2, onSelect: onDelete, danger: true });
  }

  if (isDeleted) {
    return (
      <li className="group flex items-start gap-3">
        <Avatar name={e.byName} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 text-[11.5px]">
            <span className="font-semibold text-foreground">{e.byName}</span>
            <span className="text-muted-foreground">@{e.byHandle}</span>
            <span className="text-muted-foreground/70">·</span>
            <span className="text-muted-foreground" title={atTitle} suppressHydrationWarning>
              {relTimeLong(e.at)}
            </span>
          </div>
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[12.5px] italic text-muted-foreground">
            This message was deleted
            {e.deletedByHandle && e.deletedByHandle !== e.byHandle
              ? ` by @${e.deletedByHandle}`
              : ""}
            .
          </div>
        </div>
      </li>
    );
  }

  return (
    <MessageMenu items={menuItems} as="li" className="group flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <Avatar name={e.byName} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="font-semibold text-foreground">{e.byName}</span>
          <span className="text-muted-foreground">@{e.byHandle}</span>
          <span className="text-muted-foreground/70">·</span>
          <span className="text-muted-foreground" title={atTitle} suppressHydrationWarning>
            {relTimeLong(e.at)}
          </span>
          {e.editedAt ? (
            <span className="text-muted-foreground/70" title={editedTitle}>
              · edited
            </span>
          ) : null}
          {menuItems.length > 0 ? (
            <MessageMenu
              items={menuItems}
              className="relative ml-auto opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
              renderTrigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="More"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            />
          ) : null}
        </div>

        {editing ? (
          <RichComposer
            initialValue={e.text ?? ""}
            submitLabel="Save"
            placeholder="Edit comment"
            onCancel={() => setEditing(false)}
            onSubmit={async (text) => {
              const r = await editBugCommentAction({
                bugId,
                activityId: e._id,
                text,
              });
              if (r.ok) {
                setEditing(false);
                router.refresh();
              } else {
                toast.error(r.error ?? "Save failed");
              }
              return r;
            }}
          />
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card/70 px-3 py-2.5 shadow-sm">
            <MarkdownLite text={e.text ?? ""} mentions={e.mentions} />
          </div>
        )}

        <ReactionsBar
          bugId={bugId}
          activityId={e._id}
          reactions={reactions}
          myUserId={myUserId}
        />
      </div>
    </MessageMenu>
  );
}

function SystemRow({
  Icon,
  tone,
  body,
  when,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
  body: React.ReactNode;
  when: string;
}) {
  return (
    <li className="flex items-center gap-2.5 py-0.5 pl-1.5 text-[12px]">
      <span className={cn("grid h-5 w-5 place-items-center rounded-full", tone)}>
        <Icon className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1 text-foreground/85">{body}</span>
      <span className="text-muted-foreground" title={when} suppressHydrationWarning>
        {relTimeLong(when)}
      </span>
    </li>
  );
}

const SUBMISSION_TONE = {
  fixed: {
    label: "marked as Fixed",
    Icon: CheckCircle2,
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    ring: "border-emerald-500/30 bg-emerald-500/[0.07]",
    tone: "text-emerald-700 dark:text-emerald-300",
  },
  blocked: {
    label: "marked as Blocked",
    Icon: AlertOctagon,
    chip: "bg-amber-400/20 text-amber-800 dark:text-amber-200",
    ring: "border-amber-500/30 bg-amber-400/[0.07]",
    tone: "text-amber-800 dark:text-amber-200",
  },
  wont_fix: {
    label: "marked as Won’t fix",
    Icon: XCircle,
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    ring: "border-rose-500/30 bg-rose-500/[0.07]",
    tone: "text-rose-700 dark:text-rose-300",
  },
} as const;

export function BugActivityThread({
  entries,
  bugId,
  myUserId,
  canManage = false,
  className,
}: {
  entries: BugThreadEntry[];
  bugId: string;
  myUserId: string;
  canManage?: boolean;
  className?: string;
}) {
  const [filter, setFilter] = React.useState<"all" | "comments">("all");

  const sorted = React.useMemo(
    () => [...entries].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    [entries],
  );

  const visible = sorted.filter((e) => (filter === "comments" ? e.kind === "comment" : true));

  if (entries.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground", className)}>
        <MessageSquare className="mx-auto mb-2 h-5 w-5 opacity-50" />
        No activity yet — be the first to comment.
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Activity · {sorted.length}
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-md px-2 py-0.5 transition",
              filter === "all" ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("comments")}
            className={cn(
              "rounded-md px-2 py-0.5 transition",
              filter === "comments" ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Filter className="mr-1 inline h-3 w-3" />
            Comments
          </button>
        </div>
      </div>

      <ol className="space-y-3">
        {visible.map((e) => {
          if (e.kind === "comment") {
            return (
              <CommentRow
                key={e._id}
                e={e}
                bugId={bugId}
                myUserId={myUserId}
                isMine={String(e.byId) === String(myUserId)}
                canManage={canManage}
              />
            );
          }
          if (e.kind === "submission") {
            const subKind = String(e.meta?.kind ?? "") as keyof typeof SUBMISSION_TONE;
            const meta = SUBMISSION_TONE[subKind];
            if (!meta) return null;
            const Icon = meta.Icon;
            return (
              <li key={e._id} className="flex items-start gap-3">
                <Avatar name={e.byName} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <span className="font-semibold text-foreground">{e.byName}</span>
                    <span className="text-muted-foreground">{meta.label}</span>
                    <span className="text-muted-foreground/70">·</span>
                    <RelTimeText iso={e.at} />
                  </div>
                  <div className={cn("rounded-2xl border p-3", meta.ring)}>
                    <div className={cn("flex items-center gap-1.5 text-xs font-semibold", meta.tone)}>
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label.replace("marked as ", "")}
                    </div>
                    {e.text ? <MarkdownLite className="mt-1.5" text={e.text} mentions={e.mentions} /> : null}
                  </div>
                  <ReactionsBar
                    bugId={bugId}
                    activityId={e._id}
                    reactions={groupReactions(e.reactions ?? [])}
                    myUserId={myUserId}
                  />
                </div>
              </li>
            );
          }
          if (e.kind === "request_changes") {
            return (
              <SystemRow
                key={e._id}
                Icon={Megaphone}
                tone="bg-amber-500/15 text-amber-700 dark:text-amber-300"
                when={e.at}
                body={
                  <>
                    <strong className="font-semibold">{e.byName}</strong>{" "}
                    requested changes
                    {e.text ? <>: <span className="italic">“{e.text}”</span></> : null}
                  </>
                }
              />
            );
          }
          if (e.kind === "accept") {
            return (
              <SystemRow
                key={e._id}
                Icon={CheckCircle2}
                tone="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                when={e.at}
                body={
                  <>
                    <strong className="font-semibold">{e.byName}</strong> closed this bug as{" "}
                    <strong>{String(e.meta?.closedStatus ?? "resolved").replace("_", " ")}</strong>
                  </>
                }
              />
            );
          }
          if (e.kind === "reopen") {
            return (
              <SystemRow
                key={e._id}
                Icon={RotateCcw}
                tone="bg-sky-500/15 text-sky-700 dark:text-sky-300"
                when={e.at}
                body={
                  <>
                    <strong className="font-semibold">{e.byName}</strong> reopened the bug
                    {e.text ? <>: <span className="italic">“{e.text}”</span></> : null}
                  </>
                }
              />
            );
          }
          if (e.kind === "assignment_change") {
            const unassigned = !!e.meta?.unassigned;
            return (
              <SystemRow
                key={e._id}
                Icon={UserCog}
                tone="bg-violet-500/15 text-violet-700 dark:text-violet-300"
                when={e.at}
                body={
                  unassigned ? (
                    <>
                      <strong className="font-semibold">{e.byName}</strong> unassigned the bug
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold">{e.byName}</strong> assigned to{" "}
                      <strong>{String(e.meta?.assigneeName ?? e.meta?.assigneeHandle ?? "someone")}</strong>
                      <ArrowRight className="mx-1 inline h-3 w-3" />
                    </>
                  )
                }
              />
            );
          }
          if (e.kind === "status_change") {
            return (
              <SystemRow
                key={e._id}
                Icon={ArrowRight}
                tone="bg-muted text-muted-foreground"
                when={e.at}
                body={
                  <>
                    <strong className="font-semibold">{e.byName}</strong> changed status to{" "}
                    <strong>{String(e.meta?.status ?? "")}</strong>
                  </>
                }
              />
            );
          }
          if (e.kind === "due_change") {
            const dueAt = e.meta?.dueAt as string | null | undefined;
            return (
              <SystemRow
                key={e._id}
                Icon={Calendar}
                tone="bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300"
                when={e.at}
                body={
                  dueAt ? (
                    <>
                      <strong className="font-semibold">{e.byName}</strong> set due date to{" "}
                      <strong>{new Date(dueAt).toLocaleDateString()}</strong>
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold">{e.byName}</strong> cleared the due date
                    </>
                  )
                }
              />
            );
          }
          return null;
        })}
      </ol>
    </div>
  );
}

function RelTimeText({ iso }: { iso: string }) {
  const title = useLocaleTitle(iso);
  return (
    <span className="text-muted-foreground" title={title} suppressHydrationWarning>
      {relTimeLong(iso)}
    </span>
  );
}
