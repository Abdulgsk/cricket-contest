"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bug,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  GitBranch,
  Globe,
  Hash,
  Inbox,
  Lock,
  Monitor,
  Settings2,
  Terminal,
  User as UserIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScreenshotStrip } from "@/components/ui/lightbox";
import { MarkdownLite, linkify } from "@/components/ui/markdown";
import { SlaBadge, AgeBadge } from "@/components/ui/sla-badge";
import { RichComposer } from "@/components/ui/rich-composer";
import {
  BugActivityThread,
  type BugThreadEntry,
} from "@/components/bug-activity-thread";
import {
  addBugCommentAction,
  markBugReadAction,
} from "@/actions/bugs";
import {
  STATUS_LABEL,
  SEVERITY_LABEL,
  type BugStatus,
  type Severity,
  type SubmissionKind,
  colorFromString,
  initials,
  relTimeLong,
} from "@/lib/bug-format";
import { useLiveSync } from "@/lib/use-live-sync";

/* ------------------------------------------------------------------------ */

export type BugDetail = {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: BugStatus;
  needsAdminReview: boolean;
  reporter: { id: string; handle: string; name: string };
  assignee: { id: string; handle: string; name: string } | null;
  pageUrl: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  dueAt: string | null;
  screenshots: string[];
  submission: {
    kind: SubmissionKind;
    note: string;
    submittedAt: string;
    submittedByHandle: string;
    submittedByName: string;
  } | null;
  browserContext: {
    viewport?: { w: number; h: number } | null;
    devicePixelRatio?: number | null;
    locale?: string | null;
    timezone?: string | null;
    theme?: string | null;
    referrer?: string | null;
    consoleErrors?: Array<{ at: string; msg: string }>;
    buildId?: string | null;
  } | null;
  userAgent: string | null;
  activity: BugThreadEntry[];
  relatedTo?: Array<{ id: string; title: string; status: BugStatus }>;
};

/* ------------------------------------------------------------------------ */
/*  Atoms                                                                    */
/* ------------------------------------------------------------------------ */

function SeverityChip({ severity }: { severity: Severity }) {
  const map: Record<Severity, string> = {
    high: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30",
    medium: "bg-amber-400/15 text-amber-800 dark:text-amber-200 border-amber-500/30",
    low: "bg-muted/60 text-muted-foreground border-border/60",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider",
        map[severity],
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          severity === "high" ? "bg-rose-500" : severity === "medium" ? "bg-amber-500" : "bg-muted-foreground/50",
        )}
      />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function StatusChip({ status, needsReview }: { status: BugStatus; needsReview: boolean }) {
  if (needsReview) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent">
        <Clock className="h-3 w-3" />
        Awaiting review
      </span>
    );
  }
  const map: Record<BugStatus, string> = {
    open: "bg-primary/10 text-primary border-primary/30",
    in_progress: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30",
    resolved: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    wont_fix: "bg-muted/60 text-muted-foreground border-border/60",
  };
  const Icon = status === "resolved" ? CheckCircle2 : status === "wont_fix" ? X : status === "in_progress" ? GitBranch : Inbox;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider", map[status])}>
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function PersonChip({
  name,
  handle,
  kind,
}: {
  name: string | null;
  handle: string | null;
  kind: "reporter" | "assignee";
}) {
  if (!name) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
        <UserIcon className="h-3 w-3" />
        Unassigned
      </span>
    );
  }
  const c = colorFromString(name);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 py-0.5 pl-0.5 pr-2 text-[11px]">
      <span
        className="grid h-4 w-4 place-items-center rounded-full text-[8.5px] font-bold"
        style={{ background: c.bg, color: c.fg }}
      >
        {initials(name)}
      </span>
      <span className="font-medium text-foreground">{name}</span>
      <span className="text-muted-foreground">· {kind}</span>
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/*  Browser-context panel                                                    */
/* ------------------------------------------------------------------------ */

function BrowserContextPanel({
  ctx,
  userAgent,
}: {
  ctx: BugDetail["browserContext"];
  userAgent: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const errors = ctx?.consoleErrors ?? [];
  const hasErrors = errors.length > 0;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
          Captured context
          {hasErrors ? (
            <Badge tone="danger" className="ml-1">
              {errors.length} console err
            </Badge>
          ) : null}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open ? (
        <div className="space-y-2.5 border-t border-border/40 px-3.5 py-3 text-[12px]">
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            <Meta k="Viewport" v={ctx?.viewport ? `${ctx.viewport.w} × ${ctx.viewport.h}` : null} />
            <Meta k="DPR" v={ctx?.devicePixelRatio ?? null} />
            <Meta k="Locale" v={ctx?.locale ?? null} />
            <Meta k="Timezone" v={ctx?.timezone ?? null} />
            <Meta k="Theme" v={ctx?.theme ?? null} />
            <Meta k="Build" v={ctx?.buildId ?? null} />
            <Meta k="Referrer" v={ctx?.referrer ?? null} mono />
            <Meta k="User-Agent" v={userAgent} mono small />
          </div>
          {hasErrors ? (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Terminal className="h-3 w-3" />
                Console errors
              </div>
              <ol className="space-y-1 rounded-lg border border-rose-500/20 bg-rose-500/[0.05] p-2 font-mono text-[11px]">
                {errors.map((e, i) => (
                  <li key={i} className="break-all text-rose-800 dark:text-rose-300">
                    <span className="mr-2 text-muted-foreground/70">{e.at.split("T")[1]?.slice(0, 8)}</span>
                    {e.msg}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Meta({
  k,
  v,
  mono,
  small,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  if (v == null || v === "") return null;
  return (
    <div className="flex items-baseline gap-2 truncate">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {k}
      </span>
      <span
        className={cn(
          "truncate",
          mono && "font-mono",
          small ? "text-[10.5px] text-muted-foreground" : "text-foreground/85",
        )}
      >
        {v}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Submission card                                                          */
/* ------------------------------------------------------------------------ */

function SubmissionPanel({
  submission,
}: {
  submission: NonNullable<BugDetail["submission"]>;
}) {
  const tone: Record<SubmissionKind, { ring: string; chip: string; label: string }> = {
    fixed: {
      ring: "border-emerald-500/30 bg-emerald-500/[0.07]",
      chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      label: "Fixed",
    },
    blocked: {
      ring: "border-amber-500/30 bg-amber-400/[0.07]",
      chip: "bg-amber-400/20 text-amber-800 dark:text-amber-200",
      label: "Blocked",
    },
    wont_fix: {
      ring: "border-rose-500/30 bg-rose-500/[0.07]",
      chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
      label: "Not a bug",
    },
  };
  const m = tone[submission.kind];
  return (
    <div className={cn("rounded-2xl border p-4", m.ring)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider", m.chip)}>
          <Lock className="h-3 w-3" />
          {m.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          submitted by <strong>{submission.submittedByName}</strong> · {relTimeLong(submission.submittedAt)}
        </span>
      </div>
      {submission.note ? (
        <div className="mt-2">
          <MarkdownLite text={submission.note} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Main panel                                                               */
/* ------------------------------------------------------------------------ */

export function BugDetailPanel({
  bug,
  myUserId,
  /** True if the viewer holds bugs.manage — enables deleting any comment. */
  canManage = false,
  /** Slot for status / assign / due / accept / reopen buttons. */
  actions,
  /** If true, the live-sync hook is enabled (default). */
  live = true,
  /** Compact mode used when embedded in a split-pane. */
  embedded = false,
  /** Optional close button when used in a side-drawer / split-pane. */
  onClose,
}: {
  bug: BugDetail;
  myUserId: string;
  canManage?: boolean;
  actions?: React.ReactNode;
  live?: boolean;
  embedded?: boolean;
  onClose?: () => void;
}) {
  useLiveSync({ enabled: live });

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const lastBugIdRef = React.useRef<string | null>(null);
  const lastActivityLenRef = React.useRef<number>(0);

  // Auto-scroll thread to bottom when:
  //  - the panel opens / a different bug is shown, or
  //  - a new activity row arrives (comment sent/received).
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNewBug = lastBugIdRef.current !== bug.id;
    const grew = bug.activity.length > lastActivityLenRef.current;
    lastBugIdRef.current = bug.id;
    lastActivityLenRef.current = bug.activity.length;
    if (!isNewBug && !grew) return;
    // Defer until after the DOM paints the new content.
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: isNewBug ? "auto" : "smooth" });
    });
  }, [bug.id, bug.activity.length]);

  // mark-read on view
  React.useEffect(() => {
    markBugReadAction(bug.id).catch(() => undefined);
  }, [bug.id, bug.activity.length]);

  const router = useRouter();

  return (
    <article className={cn("flex h-full min-h-0 flex-col", embedded ? "" : "max-w-3xl mx-auto w-full")}>
      {/* sticky header */}
      <header
        className={cn(
          "sticky top-0 z-10 flex flex-col gap-3 border-b border-border/50 bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6",
          embedded ? "rounded-t-2xl" : "",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Bug className="h-3.5 w-3.5" />
              <span className="font-mono">
                <Hash className="inline h-3 w-3 -mt-0.5" />
                {bug.id.slice(-6)}
              </span>
              <span>·</span>
              <span>opened {relTimeLong(bug.createdAt)}</span>
              <span>by</span>
              <span className="font-medium text-foreground">{bug.reporter.name}</span>
            </div>
            <h1 className="text-[18px] font-semibold leading-snug tracking-tight text-foreground sm:text-[20px]">
              {bug.title}
            </h1>
          </div>
          {onClose ? (
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={bug.status} needsReview={bug.needsAdminReview} />
          <SeverityChip severity={bug.severity} />
          {bug.dueAt ? <SlaBadge dueAt={bug.dueAt} /> : null}
          <AgeBadge createdAt={bug.createdAt} status={bug.status} />
          <PersonChip name={bug.assignee?.name ?? null} handle={bug.assignee?.handle ?? null} kind="assignee" />
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
      </header>

      {/* scrollable body */}
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        {/* meta strip */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted-foreground">
          {bug.pageUrl ? (
            <a
              href={bug.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate hover:text-foreground"
            >
              <Globe className="h-3 w-3" />
              <span className="truncate">{bug.pageUrl}</span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          ) : null}
          <PersonChip name={bug.reporter.name} handle={bug.reporter.handle} kind="reporter" />
        </div>

        {/* description */}
        <section className="rounded-2xl border border-border/60 bg-card/50 px-4 py-3.5">
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Description
          </div>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {linkify(bug.description)}
          </div>
        </section>

        {bug.screenshots.length ? (
          <section>
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Screenshots
            </div>
            <ScreenshotStrip images={bug.screenshots} alt={bug.title} />
          </section>
        ) : null}

        {bug.browserContext || bug.userAgent ? (
          <BrowserContextPanel ctx={bug.browserContext} userAgent={bug.userAgent} />
        ) : null}

        {bug.adminNotes ? (
          <section className="rounded-2xl border border-amber-500/25 bg-amber-400/[0.05] px-3.5 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
              <Settings2 className="h-3 w-3" />
              Admin notes
            </div>
            <div className="text-[13px] text-foreground/85 whitespace-pre-wrap">{bug.adminNotes}</div>
          </section>
        ) : null}

        {bug.submission ? (
          <section>
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Assignee submission
            </div>
            <SubmissionPanel submission={bug.submission} />
          </section>
        ) : null}

        {bug.relatedTo?.length ? (
          <section>
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Related
            </div>
            <ul className="flex flex-wrap gap-2">
              {bug.relatedTo.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/bugs/${r.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11.5px] hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Hash className="h-3 w-3" />
                    <span className="max-w-[20ch] truncate font-medium">{r.title}</span>
                    <StatusChip status={r.status} needsReview={false} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* activity */}
        <section>
          <BugActivityThread entries={bug.activity} bugId={bug.id} myUserId={myUserId} canManage={canManage} />
        </section>
      </div>

      {/* sticky composer */}
      <footer
        className={cn(
          "sticky bottom-0 z-10 border-t border-border/50 bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6",
          embedded ? "rounded-b-2xl" : "",
        )}
      >
        <RichComposer
          compact
          placeholder="Add a comment… (markdown + @mentions)"
          submitLabel="Comment"
          onSubmit={async (text) => {
            const r = await addBugCommentAction({ id: bug.id, text });
            if (!r.ok) toast.error(r.error ?? "Comment failed");
            else router.refresh();
            return r;
          }}
        />
      </footer>
    </article>
  );
}
