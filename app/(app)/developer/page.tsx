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
import { BugReportsAdmin, type BugRow, type BugAssignee } from "@/components/admin/bug-reports-admin";
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

async function loadBugData(): Promise<{ rows: BugRow[]; openCount: number }> {
  const docs = await BugReport.find().sort({ createdAt: -1 }).limit(200).lean();
  const rows: BugRow[] = docs.map((b) => ({
    id: String(b._id),
    title: b.title,
    description: b.description,
    severity: b.severity,
    status: b.status,
    reporterName: b.reporterName ?? "—",
    reporterHandle: b.reporterHandle ?? "—",
    pageUrl: b.pageUrl ?? null,
    adminNotes: b.adminNotes ?? null,
    assignedToId: b.assignedTo ? String(b.assignedTo) : null,
    assignedToHandle: b.assignedToHandle ?? null,
    assignedToName: b.assignedToName ?? null,
    resolutionNote: b.resolutionNote ?? null,
    submission: b.submission
      ? {
          kind: b.submission.kind,
          note: b.submission.note,
          submittedAt: new Date(b.submission.submittedAt).toISOString(),
          submittedByHandle: b.submission.submittedByHandle,
          submittedByName: b.submission.submittedByName,
        }
      : null,
    needsAdminReview: Boolean(b.needsAdminReview),
    activity: (b.activity ?? []).map((a) => ({
      _id: a._id ? String(a._id) : undefined,
      at: new Date(a.at).toISOString(),
      byId: a.byId ? String(a.byId) : null,
      byName: a.byName,
      byHandle: a.byHandle,
      kind: a.kind,
      text: a.text ?? "",
      meta: (a.meta ?? null) as Record<string, unknown> | null,
    })),
    screenshots: b.screenshots ?? [],
    createdAt: new Date(b.createdAt).toISOString(),
  }));
  const openCount = rows.filter((b) => b.needsAdminReview || b.status === "open").length;
  return { rows, openCount };
}

async function loadAssignees(): Promise<BugAssignee[]> {
  const users = await User.find().select("userId username").sort({ username: 1 }).lean();
  return users.map((u) => ({
    id: String(u._id),
    handle: u.userId,
    name: u.username,
  }));
}

async function loadWorkItems(): Promise<{ rows: WorkItemRow[]; openCount: number }> {
  const docs = await WorkItem.find().sort({ needsReview: -1, createdAt: -1 }).limit(200).lean();
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
  const canViewBugs = userHasFeature(me, "bugs.view");
  const canManageBugs = userHasFeature(me, "bugs.manage");
  const canViewWorkItems = userHasFeature(me, "dev.workitems.view");
  const canManageWorkItems = userHasFeature(me, "dev.workitems.manage");
  const canViewAudit = userHasFeature(me, "audit.view");
  const canViewDiagnostics = userHasFeature(me, "dev.diagnostics.view");

  if (
    !canViewBugs &&
    !canViewWorkItems &&
    !canViewAudit &&
    !canViewDiagnostics
  ) {
    return (
      <NoAccessCard
        anyOf={[
          "bugs.view",
          "dev.workitems.view",
          "audit.view",
          "dev.diagnostics.view",
        ]}
      />
    );
  }

  await connectDB();

  const [bugData, assignees, workItems, diagnostics] = await Promise.all([
    canViewBugs ? loadBugData() : Promise.resolve(null),
    canManageBugs || canManageWorkItems ? loadAssignees() : Promise.resolve(null),
    canViewWorkItems ? loadWorkItems() : Promise.resolve(null),
    canViewDiagnostics ? loadDiagnostics() : Promise.resolve(null),
  ]);

  const workItemAssignees: WorkItemAssignee[] = assignees ?? [];

  const tabs: { id: string; label: string; badge?: number; content: React.ReactNode }[] = [];

  if (canViewBugs && bugData) {
    tabs.push({
      id: "bugs",
      label: "Bug reports",
      badge: bugData.openCount,
      content: (
        <BugReportsAdmin
          initial={bugData.rows}
          canManage={canManageBugs}
          assignees={assignees ?? []}
        />
      ),
    });
  }

  if (canViewWorkItems && workItems) {
    tabs.push({
      id: "workitems",
      label: "Work items",
      badge: workItems.openCount,
      content: (
        <WorkItemsPanel
          initial={workItems.rows}
          canManage={canManageWorkItems}
          assignees={workItemAssignees}
        />
      ),
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
