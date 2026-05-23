import { connectDB } from "@/lib/db";
import { BugReport } from "@/models/BugReport";
import { WorkItem } from "@/models/WorkItem";
import { requireUser } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { MyBugResolveForm } from "@/components/my-bug-resolve-form";
import { MyWorkItemResolveForm } from "@/components/my-work-item-resolve-form";
import { ActivityThread, type ActivityEntry } from "@/components/activity-thread";
import { MyCommentComposer } from "@/components/my-comment-composer";
import { CheckCircle2, AlertOctagon, XCircle, Lock, Clock } from "lucide-react";

function mapActivity(raw: unknown[]): ActivityEntry[] {
  return (raw ?? []).map((x) => {
    const a = x as {
      _id?: unknown;
      at: Date | string;
      byId?: unknown;
      byName: string;
      byHandle: string;
      kind: ActivityEntry["kind"];
      text?: string;
      meta?: Record<string, unknown> | null;
    };
    return {
      _id: a._id ? String(a._id) : undefined,
      at: new Date(a.at).toISOString(),
      byId: a.byId ? String(a.byId) : null,
      byName: a.byName,
      byHandle: a.byHandle,
      kind: a.kind,
      text: a.text ?? "",
      meta: a.meta ?? null,
    };
  });
}

type BugStatus = "open" | "in_progress" | "resolved" | "wont_fix";
type Severity = "low" | "medium" | "high";
type SubmissionKind = "fixed" | "blocked" | "wont_fix";

const severityTone = (s: Severity) =>
  s === "high" ? "danger" : s === "medium" ? "warning" : "default";

const STATUS_LABEL: Record<BugStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

const SUBMISSION_META: Record<
  SubmissionKind,
  { label: string; icon: typeof CheckCircle2; tone: string; ring: string }
> = {
  fixed: {
    label: "Fixed",
    icon: CheckCircle2,
    tone: "text-violet-700 dark:text-violet-300",
    ring: "border-violet-500/25 bg-violet-500/[0.06] dark:bg-violet-500/[0.08]",
  },
  blocked: {
    label: "Blocked",
    icon: AlertOctagon,
    tone: "text-amber-800 dark:text-amber-200",
    ring: "border-amber-500/25 bg-amber-400/[0.06] dark:bg-amber-500/[0.08]",
  },
  wont_fix: {
    label: "Not a bug",
    icon: XCircle,
    tone: "text-rose-700 dark:text-rose-300",
    ring: "border-rose-500/25 bg-rose-500/[0.06] dark:bg-rose-500/[0.08]",
  },
};

function StatusChip({
  status,
  needsReview,
}: {
  status: BugStatus;
  needsReview: boolean;
}) {
  if (needsReview) {
    return (
      <Badge tone="accent">
        <Clock className="inline h-3 w-3 mr-1 -mt-0.5" />
        Awaiting review
      </Badge>
    );
  }
  const tone =
    status === "open"
      ? "warning"
      : status === "in_progress"
        ? "accent"
        : status === "resolved"
          ? "success"
          : "default";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

function SubmissionCard({
  kind,
  note,
  at,
  locked,
}: {
  kind: SubmissionKind;
  note: string;
  at: string;
  locked: boolean;
}) {
  const meta = SUBMISSION_META[kind];
  const Icon = meta.icon;
  return (
    <div className={`rounded-2xl border ${meta.ring} p-3.5 space-y-2`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className={`flex items-center gap-2 text-sm font-semibold ${meta.tone}`}>
          <Icon className="h-4 w-4" />
          <span>
            You marked it{" "}
            <span className="underline decoration-dotted underline-offset-4">
              {meta.label}
            </span>
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(at).toLocaleString()}
        </span>
      </div>
      <div className="whitespace-pre-wrap text-sm text-foreground/90 break-words">{note}</div>
      {locked ? (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
          <Lock className="h-3 w-3" />
          With manager for review.
        </div>
      ) : null}
    </div>
  );
}

export default async function MyBugsPage() {
  const me = await requireUser();
  await connectDB();

  const [bugs, workItems] = await Promise.all([
    BugReport.find({ assignedTo: me._id })
      .sort({ needsAdminReview: -1, status: 1, createdAt: -1 })
      .limit(200)
      .lean(),
    WorkItem.find({ assignedToId: me._id })
      .sort({ needsReview: -1, status: 1, createdAt: -1 })
      .limit(200)
      .lean(),
  ]);

  const activeWorkItems = workItems.filter(
    (w) => w.status !== "done" || w.needsReview,
  );
  const closedWorkItems = workItems.filter(
    (w) => w.status === "done" && !w.needsReview,
  );

  const active = bugs.filter(
    (b) => b.status === "open" || b.status === "in_progress" || b.needsAdminReview,
  );
  const closed = bugs.filter(
    (b) =>
      !b.needsAdminReview && (b.status === "resolved" || b.status === "wont_fix"),
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <h1 className="text-lg font-semibold">My queue</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Bug reports and work items assigned to you. Pick one outcome, write a
          short note and submit — that&apos;s your only handoff. A manager will
          accept it or reopen for another round.
        </p>
      </Card>

      <section className="space-y-2.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Active ({active.length})
        </div>
        {active.length === 0 ? (
          <Card className="text-sm text-muted-foreground border-border/70">
            Nothing on your plate.
          </Card>
        ) : (
          active.map((b) => (
            <Card key={String(b._id)} className="border-border/70 space-y-2.5">
              <div className="flex items-start gap-2 flex-wrap">
                <h2 className="font-semibold text-sm">{b.title}</h2>
                <Badge tone={severityTone(b.severity)}>{b.severity}</Badge>
                <StatusChip
                  status={b.status}
                  needsReview={Boolean(b.needsAdminReview)}
                />
              </div>
              <div className="text-[11px] text-muted-foreground">
                from <span className="text-foreground">{b.reporterName ?? "—"}</span>{" "}
                <span className="opacity-70">@{b.reporterHandle ?? "—"}</span> ·{" "}
                {new Date(b.createdAt).toLocaleString()}
                {b.pageUrl ? <span className="ml-1">· {b.pageUrl}</span> : null}
              </div>
              <div className="text-sm whitespace-pre-wrap text-foreground/90">
                {b.description}
              </div>
              {b.adminNotes ? (
                <div className="rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Note from admin
                  </div>
                  <div className="whitespace-pre-wrap text-foreground/90">
                    {b.adminNotes}
                  </div>
                </div>
              ) : null}
              {b.submission ? (
                <SubmissionCard
                  kind={b.submission.kind}
                  note={b.submission.note}
                  at={new Date(b.submission.submittedAt).toISOString()}
                  locked
                />
              ) : (
                <MyBugResolveForm id={String(b._id)} />
              )}
              <details className="group rounded-xl border border-border/50 bg-card/30 overflow-hidden" open>
                <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 select-none">
                  <span className="inline-block transition group-open:rotate-90">▸</span>
                  Activity
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-foreground/70">
                    {(b.activity ?? []).length}
                  </span>
                </summary>
                <div className="p-2.5 space-y-2.5 border-t border-border/40">
                  <ActivityThread entries={mapActivity(b.activity ?? [])} />
                  <MyCommentComposer id={String(b._id)} kind="bug" />
                </div>
              </details>
            </Card>
          ))
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-2.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Closed ({closed.length})
          </div>
          {closed.map((b) => (
            <Card
              key={String(b._id)}
              className="border-border/70 space-y-2 opacity-90"
            >
              <div className="flex items-start gap-2 flex-wrap">
                <h2 className="font-semibold text-sm">{b.title}</h2>
                <Badge tone={severityTone(b.severity)}>{b.severity}</Badge>
                <StatusChip status={b.status} needsReview={false} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                closed{" "}
                {b.resolvedAt ? new Date(b.resolvedAt).toLocaleString() : ""}
              </div>
              {b.submission ? (
                <SubmissionCard
                  kind={b.submission.kind}
                  note={b.submission.note}
                  at={new Date(b.submission.submittedAt).toISOString()}
                  locked={false}
                />
              ) : b.resolutionNote ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/5 p-2.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold mb-1">
                    Your note
                  </div>
                  <div className="whitespace-pre-wrap text-foreground/90">
                    {b.resolutionNote}
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-2.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Work items ({activeWorkItems.length})
        </div>
        {activeWorkItems.length === 0 ? (
          <Card className="text-sm text-muted-foreground border-border/70">
            No work items assigned to you right now.
          </Card>
        ) : (
          activeWorkItems.map((w) => {
            const meta = w.submission ? SUBMISSION_META[
              w.submission.kind === "done"
                ? "fixed"
                : w.submission.kind === "wont_do"
                  ? "wont_fix"
                  : "blocked"
            ] : null;
            return (
              <Card key={String(w._id)} className="border-border/70 space-y-2.5">
                <div className="flex items-start gap-2 flex-wrap">
                  <h2 className="font-semibold text-sm">{w.title}</h2>
                  <Badge tone={w.priority === "high" ? "danger" : w.priority === "medium" ? "warning" : "default"}>
                    {w.priority}
                  </Badge>
                  {w.needsReview ? (
                    <Badge tone="accent">
                      <Clock className="inline h-3 w-3 mr-1 -mt-0.5" />
                      Awaiting review
                    </Badge>
                  ) : (
                    <Badge tone={w.status === "blocked" ? "danger" : w.status === "in_progress" ? "accent" : "default"}>
                      {w.status === "in_progress" ? "In progress" : w.status === "blocked" ? "Blocked" : "Open"}
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  from <span className="text-foreground">{w.createdByName}</span>{" "}
                  <span className="opacity-70">@{w.createdByHandle}</span> ·{" "}
                  {new Date(w.createdAt).toLocaleString()}
                  {w.dueAt ? (
                    <span className="ml-1">· Due {new Date(w.dueAt).toLocaleDateString()}</span>
                  ) : null}
                </div>
                {w.description ? (
                  <div className="text-sm whitespace-pre-wrap text-foreground/90">
                    {w.description}
                  </div>
                ) : null}
                {w.submission && meta ? (
                  <div className={`rounded-xl border ${meta.ring} p-3 space-y-1.5`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${meta.tone}`}>
                        <meta.icon className="h-3.5 w-3.5" />
                        <span>You submitted: {meta.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(w.submission.submittedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-xs text-foreground/90">
                      {w.submission.note}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                      <Lock className="h-3 w-3" />
                      Locked — manager will accept or reopen.
                    </div>
                  </div>
                ) : (
                  <MyWorkItemResolveForm id={String(w._id)} />
                )}
                <details className="group rounded-xl border border-border/50 bg-card/30 overflow-hidden" open>
                  <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 select-none">
                    <span className="inline-block transition group-open:rotate-90">▸</span>
                    Activity
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-foreground/70">
                      {(w.activity ?? []).length}
                    </span>
                  </summary>
                  <div className="p-2.5 space-y-2.5 border-t border-border/40">
                    <ActivityThread entries={mapActivity(w.activity ?? [])} />
                    <MyCommentComposer id={String(w._id)} kind="workitem" />
                  </div>
                </details>
              </Card>
            );
          })
        )}
      </section>

      {closedWorkItems.length > 0 && (
        <section className="space-y-2.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Closed work items ({closedWorkItems.length})
          </div>
          {closedWorkItems.map((w) => (
            <Card key={String(w._id)} className="border-border/70 space-y-2 opacity-90">
              <div className="flex items-start gap-2 flex-wrap">
                <h2 className="font-semibold text-sm">{w.title}</h2>
                <Badge tone="success">Done</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">
                closed {w.closedAt ? new Date(w.closedAt).toLocaleString() : ""}
              </div>
              {w.submission ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/5 p-2.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold mb-1">
                    Your note
                  </div>
                  <div className="whitespace-pre-wrap text-foreground/90">
                    {w.submission.note}
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
