import { connectDB } from "@/lib/db";
import { BugReport } from "@/models/BugReport";
import { requireUser } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { MyBugResolveForm } from "@/components/my-bug-resolve-form";
import { CheckCircle2, AlertOctagon, XCircle, Lock, Clock } from "lucide-react";

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
    <div className={`rounded-xl border ${meta.ring} p-3 space-y-1.5`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${meta.tone}`}>
          <Icon className="h-3.5 w-3.5" />
          <span>You submitted: {meta.label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(at).toLocaleString()}
        </span>
      </div>
      <div className="whitespace-pre-wrap text-xs text-foreground/90">{note}</div>
      {locked ? (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
          <Lock className="h-3 w-3" />
          Locked — admin will accept or reopen.
        </div>
      ) : null}
    </div>
  );
}

export default async function MyBugsPage() {
  const me = await requireUser();
  await connectDB();

  const bugs = await BugReport.find({ assignedTo: me._id })
    .sort({ needsAdminReview: -1, status: 1, createdAt: -1 })
    .limit(200)
    .lean();

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
        <h1 className="text-lg font-semibold">My bugs</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Bugs assigned to you. Pick one outcome, write a short note and submit
          — that&apos;s your only handoff. The admin will accept it or reopen
          for another round.
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
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold mb-1">
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
    </div>
  );
}
