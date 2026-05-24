import Link from "next/link";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { BugReport } from "@/models/BugReport";
import { User } from "@/models/User";
import { WorkItem } from "@/models/WorkItem";
import { AuditLog } from "@/models/AuditLog";
import { Match } from "@/models/Match";
import { Prediction } from "@/models/Prediction";
import { Rivalry } from "@/models/Rivalry";
import { Card } from "@/components/ui/card";
import { NoAccessCard } from "@/components/no-access-card";
import { AdminOverviewTabs } from "@/components/admin/admin-overview-tabs";
import { BugsInboxClient, type InboxBugRow } from "@/components/bug/bugs-inbox-client";
import { getBugDetail } from "@/services/bug-detail";
import { QueueSwitcher, type QueueOption } from "@/components/dev/queue-switcher";
type BugAssignee = { id: string; handle: string; name: string };
import { WorkItemsPanel, type WorkItemRow, type WorkItemAssignee } from "@/components/dev/work-items-panel";
import { DiagnosticsPanel, type DiagnosticsData } from "@/components/dev/diagnostics-panel";
import { requireUser, userHasFeature } from "@/lib/rbac";

export const metadata = { title: "Developer Tools" };
export const dynamic = "force-dynamic";

const MONGO_STATES: Record<number, DiagnosticsData["mongo"]["state"]> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnected",
  99: "uninitialized",
};

async function loadBugData(
  myUserId: string,
  opts?: { assignedToMeOnly?: boolean },
): Promise<{ rows: InboxBugRow[]; openCount: number }> {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (opts?.assignedToMeOnly) filter.assignedTo = myUserId;
  const docs = await BugReport.find(filter)
    .sort({ needsAdminReview: -1, status: 1, updatedAt: -1 })
    .limit(200)
    .lean();
  const rows: InboxBugRow[] = await Promise.all(
    docs.map(async (b) => {
      const detail = await getBugDetail(String(b._id));
      const commentCount = (b.activity ?? []).filter((a) => a.kind === "comment").length;
      const lr = (b.viewerState as Map<string, { lastReadAt: Date }> | undefined)?.get?.(
        myUserId,
      );
      const lastReadAt =
        lr?.lastReadAt instanceof Date ? lr.lastReadAt.toISOString() : null;
      return {
        id: String(b._id),
        title: b.title,
        severity: b.severity,
        status: b.status,
        needsAdminReview: Boolean(b.needsAdminReview),
        reporterName: b.reporterName ?? "—",
        reporterHandle: b.reporterHandle ?? "—",
        pageUrl: b.pageUrl ?? null,
        createdAt:
          b.createdAt instanceof Date ? b.createdAt.toISOString() : new Date().toISOString(),
        updatedAt:
          b.updatedAt instanceof Date ? b.updatedAt.toISOString() : new Date().toISOString(),
        dueAt: b.dueAt instanceof Date ? b.dueAt.toISOString() : null,
        hasScreenshots: Array.isArray(b.screenshots) && b.screenshots.length > 0,
        commentCount,
        lastReadAt,
        submissionKind: (b.submission?.kind ?? null) as InboxBugRow["submissionKind"],
        assigneeId: b.assignedTo ? String(b.assignedTo) : null,
        assigneeName: b.assignedToName ?? null,
        detail: detail!,
      };
    }),
  );
  const openCount = rows.filter((b) => b.needsAdminReview || b.status === "open").length;
  return { rows, openCount };
}

async function loadAssignees(): Promise<BugAssignee[]> {  const users = await User.find().select("userId username").sort({ username: 1 }).lean();
  return users.map((u) => ({
    id: String(u._id),
    handle: u.userId,
    name: u.username,
  }));
}

async function loadWorkItems(opts?: {
  assignedToMeId?: string;
}): Promise<{ rows: WorkItemRow[]; openCount: number }> {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (opts?.assignedToMeId) filter.assignedToId = opts.assignedToMeId;
  const docs = await WorkItem.find(filter)
    .sort({ needsReview: -1, createdAt: -1 })
    .limit(200)
    .lean();
  const rows: WorkItemRow[] = docs.map((w) => ({
    id: String(w._id),
    title: w.title,
    description: w.description ?? "",
    status: w.status,
    priority: w.priority,
    createdByName: w.createdByName,
    createdByHandle: w.createdByHandle,
    assignedToId: String(w.assignedToId),
    assignedToName: w.assignedToName,
    assignedToHandle: w.assignedToHandle,
    dueAt: w.dueAt ? new Date(w.dueAt).toISOString() : null,
    createdAt: new Date(w.createdAt).toISOString(),
    submission: w.submission
      ? {
          kind: w.submission.kind,
          note: w.submission.note,
          submittedAt: new Date(w.submission.submittedAt).toISOString(),
          submittedByHandle: w.submission.submittedByHandle,
          submittedByName: w.submission.submittedByName,
        }
      : null,
    needsReview: Boolean(w.needsReview),
    activity: (w.activity ?? []).map((a) => ({
      _id: a._id ? String(a._id) : undefined,
      at: new Date(a.at).toISOString(),
      byId: a.byId ? String(a.byId) : null,
      byName: a.byName,
      byHandle: a.byHandle,
      kind: a.kind,
      text: a.text ?? "",
      meta: (a.meta ?? null) as Record<string, unknown> | null,
      deletedAt: a.deletedAt ? new Date(a.deletedAt).toISOString() : null,
      deletedByName: a.deletedByName ?? null,
      deletedByHandle: a.deletedByHandle ?? null,
    })),
  }));
  const openCount = rows.filter((r) => r.status !== "done" || r.needsReview).length;
  return { rows, openCount };
}

async function loadDiagnostics(): Promise<DiagnosticsData> {
  const mem = process.memoryUsage();
  const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

  const state = (MONGO_STATES[mongoose.connection.readyState] ??
    "uninitialized") as DiagnosticsData["mongo"]["state"];
  const host = mongoose.connection.host
    ? `${mongoose.connection.host}/${mongoose.connection.name ?? ""}`
    : null;

  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const [users, matches, predictions, rivalries, workItems, bugReports, auditEvents, recentAudit] =
    await Promise.all([
      User.estimatedDocumentCount(),
      Match.estimatedDocumentCount(),
      Prediction.estimatedDocumentCount(),
      Rivalry.estimatedDocumentCount(),
      WorkItem.estimatedDocumentCount(),
      BugReport.estimatedDocumentCount(),
      AuditLog.estimatedDocumentCount(),
      AuditLog.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" },
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

  const byDay = new Map(recentAudit.map((r) => [r._id, r.count]));
  const activity: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    activity.push({ day: key, count: byDay.get(key) ?? 0 });
  }

  return {
    uptimeSec: Math.round(process.uptime()),
    nodeVersion: process.version,
    memory: {
      rssMb: mb(mem.rss),
      heapUsedMb: mb(mem.heapUsed),
      heapTotalMb: mb(mem.heapTotal),
      externalMb: mb(mem.external),
    },
    mongo: { state, host },
    counts: {
      users,
      matches,
      predictions,
      rivalries,
      workItems,
      bugReports,
      auditEvents,
    },
    activity,
    generatedAt: new Date().toISOString(),
  };
}

export default async function DeveloperToolsPage() {
  const me = await requireUser();
  const canManageBugs = userHasFeature(me, "bugs.manage");
  const canManageWorkItems = userHasFeature(me, "dev.workitems.manage");
  // The "Developer" flag grants view of ALL bugs + work items (and the
  // ability to comment), but action buttons stay hidden until the item is
  // assigned to them or they hold the matching .manage feature.
  const isDeveloperMember = userHasFeature(me, "dev.member");
  // Managers implicitly count as members (they can see everything anyway).
  const canViewBugs = isDeveloperMember || canManageBugs;
  const canViewWorkItems = isDeveloperMember || canManageWorkItems;
  const canViewAudit = userHasFeature(me, "audit.view");
  const canViewDiagnostics = userHasFeature(me, "dev.diagnostics.view");

  await connectDB();

  // Anyone with an assigned bug or work item can use the developer queue,
  // even without the developer flag (they only see their own rows).
  const [myBugCount, myWorkCount] = await Promise.all([
    BugReport.countDocuments({ assignedTo: me._id, deletedAt: null }),
    WorkItem.countDocuments({ assignedToId: me._id, deletedAt: null }),
  ]);
  const hasAssignedBugs = myBugCount > 0;
  const hasAssignedWork = myWorkCount > 0;

  if (
    !canViewBugs &&
    !canViewWorkItems &&
    !canViewAudit &&
    !canViewDiagnostics &&
    !hasAssignedBugs &&
    !hasAssignedWork
  ) {
    return (
      <NoAccessCard
        anyOf={[
          "dev.member",
          "bugs.manage",
          "dev.workitems.manage",
          "audit.view",
          "dev.diagnostics.view",
        ]}
      />
    );
  }

  // Bugs: full view if user can see all, otherwise scoped to mine.
  const bugLoader = canViewBugs
    ? loadBugData(String(me._id))
    : hasAssignedBugs
      ? loadBugData(String(me._id), { assignedToMeOnly: true })
      : Promise.resolve(null);
  // Work items: same pattern.
  const workLoader = canViewWorkItems
    ? loadWorkItems()
    : hasAssignedWork
      ? loadWorkItems({ assignedToMeId: String(me._id) })
      : Promise.resolve(null);

  const [bugData, assignees, workItems, diagnostics] = await Promise.all([
    bugLoader,
    canManageBugs || canManageWorkItems ? loadAssignees() : Promise.resolve(null),
    workLoader,
    canViewDiagnostics ? loadDiagnostics() : Promise.resolve(null),
  ]);

  const workItemAssignees: WorkItemAssignee[] = assignees ?? [];

  const tabs: { id: string; label: string; badge?: number; content: React.ReactNode }[] = [];

  // Single "Queue" tab with a dropdown to switch between bugs and work items.
  const queueOptions: QueueOption[] = [];

  if (bugData) {
    queueOptions.push({
      kind: "bugs",
      label: "Bug reports",
      badge: bugData.openCount,
      content: (
        <BugsInboxClient
          rows={bugData.rows}
          myUserId={String(me._id)}
          canManage={canManageBugs}
          assignables={assignees ?? []}
          adminMode={canManageBugs}
          emptyTitle="Inbox zero"
          emptyHint="No bugs here right now."
        />
      ),
    });
  }
  if (workItems) {
    queueOptions.push({
      kind: "workitems",
      label: "Work items",
      badge: workItems.openCount,
      content: (
        <WorkItemsPanel
          initial={workItems.rows}
          canManage={canManageWorkItems}
          assignees={workItemAssignees}
          myUserId={String(me._id)}
        />
      ),
    });
  }
  if (queueOptions.length > 0) {
    const totalBadge = queueOptions.reduce((s, o) => s + (o.badge ?? 0), 0);
    tabs.push({
      id: "queue",
      label: "Queue",
      badge: totalBadge,
      content: <QueueSwitcher options={queueOptions} />,
    });
  }

  if (canViewAudit) {
    tabs.push({
      id: "audit",
      label: "Audit log",
      content: (
        <Card className="border-border/70">
          <h3 className="text-sm font-semibold">Audit log</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Full action history with filters, search and pagination.
          </p>
          <Link
            href="/developer/audit-logs"
            className="mt-3 inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Open audit log →
          </Link>
        </Card>
      ),
    });
  }

  if (canViewDiagnostics && diagnostics) {
    tabs.push({
      id: "diagnostics",
      label: "Diagnostics",
      content: <DiagnosticsPanel data={diagnostics} />,
    });
  }

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-primary/8 via-card to-card">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
          <span className="size-1.5 rounded-full bg-primary" /> Developer
        </div>
        <h1 className="mt-1.5 text-lg sm:text-2xl font-semibold tracking-tight">
          Developer Tools
        </h1>
        <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
          Bug triage, work items, audit history and runtime diagnostics. Each section
          is an independent feature toggle — enabling one does not grant the others.
        </p>
      </Card>

      <AdminOverviewTabs tabs={tabs} />
    </div>
  );
}
