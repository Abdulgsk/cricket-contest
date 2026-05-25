import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { BugReport } from "@/models/BugReport";
import { User } from "@/models/User";
import { WorkItem } from "@/models/WorkItem";
import { AuditLog } from "@/models/AuditLog";
import { NoAccessCard } from "@/components/no-access-card";
import { BugsInboxClient, type InboxBugRow } from "@/components/bug/bugs-inbox-client";
import { getBugDetail } from "@/services/bug-detail";
type BugAssignee = { id: string; handle: string; name: string };
import { WorkItemsPanel, type WorkItemRow, type WorkItemAssignee } from "@/components/dev/work-items-panel";
import { DiagnosticsPanel, type DiagnosticsData } from "@/components/dev/diagnostics-panel";
import {
  AuditLogPanel,
  type AuditFilter,
  type AuditRow,
} from "@/components/dev/audit-log-panel";
import { requireUser, userHasFeature } from "@/lib/rbac";

export const metadata = { title: "Developer Tools" };
export const dynamic = "force-dynamic";

const AUDIT_PAGE_SIZE = 50;

async function loadAuditData(filter: AuditFilter): Promise<{
  rows: AuditRow[];
  total: number;
  page: number;
  totalPages: number;
  distinctActions: string[];
}> {
  const page = Math.max(1, Number(filter.page) || 1);
  const q: Record<string, unknown> = {};
  if (filter.category && ["create", "update", "delete", "auth", "action"].includes(filter.category)) {
    q.category = filter.category;
  }
  if (filter.action) q.action = filter.action;
  if (filter.actor) {
    q.$or = [
      { actorHandle: filter.actor.toLowerCase() },
      { actorUsername: new RegExp(`^${escapeRegex(filter.actor)}$`, "i") },
    ];
  }
  const [docs, total, distinctActions] = await Promise.all([
    AuditLog.find(q)
      .sort({ createdAt: -1 })
      .skip((page - 1) * AUDIT_PAGE_SIZE)
      .limit(AUDIT_PAGE_SIZE)
      .lean(),
    AuditLog.countDocuments(q),
    AuditLog.distinct("action"),
  ]);
  const rows: AuditRow[] = docs.map((r) => ({
    _id: String(r._id),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date().toISOString(),
    category: r.category,
    action: r.action,
    actorHandle: r.actorHandle ?? null,
    actorUsername: r.actorUsername ?? null,
    targetType: r.targetType ?? null,
    targetId: r.targetId ?? null,
    meta: (r.meta as Record<string, unknown> | null | undefined) ?? null,
    ip: r.ip ?? null,
  }));
  return {
    rows,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    distinctActions: (distinctActions as string[]) ?? [],
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    generatedAt: new Date().toISOString(),
  };
}

export default async function DeveloperToolsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const pick = (k: string): string | undefined => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0];
    return typeof v === "string" ? v : undefined;
  };
  const me = await requireUser();
  const canManageBugs = userHasFeature(me, "dev.bug.manage");
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
          "dev.bug.manage",
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

  const [bugData, assignees, workItems, diagnostics, auditData] = await Promise.all([
    bugLoader,
    canManageBugs || canManageWorkItems ? loadAssignees() : Promise.resolve(null),
    workLoader,
    canViewDiagnostics ? loadDiagnostics() : Promise.resolve(null),
    canViewAudit
      ? loadAuditData({
          category: pick("category"),
          action: pick("action"),
          actor: pick("actor"),
          page: pick("page"),
        })
      : Promise.resolve(null),
  ]);

  const workItemAssignees: WorkItemAssignee[] = assignees ?? [];

  // The sidebar already exposes Bug reports / Work items / Diagnostics / Audit
  // log as separate sub-items. Read ?tab=… and render the matching panel
  // directly — no in-page tab bar, no dropdown.
  const panels: Record<string, { label: string; node: React.ReactNode }> = {};

  if (bugData) {
    panels.bugs = {
      label: "Bug reports",
      node: (
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
    };
  }
  if (workItems) {
    panels.workitems = {
      label: "Work items",
      node: (
        <WorkItemsPanel
          initial={workItems.rows}
          canManage={canManageWorkItems}
          assignees={workItemAssignees}
          myUserId={String(me._id)}
        />
      ),
    };
  }
  if (canViewAudit && auditData) {
    panels.audit = {
      label: "Audit log",
      node: (
        <AuditLogPanel
          rows={auditData.rows}
          total={auditData.total}
          page={auditData.page}
          totalPages={auditData.totalPages}
          distinctActions={auditData.distinctActions}
          filter={{
            category: pick("category"),
            action: pick("action"),
            actor: pick("actor"),
            page: pick("page"),
          }}
        />
      ),
    };
  }
  if (canViewDiagnostics && diagnostics) {
    panels.diagnostics = {
      label: "Diagnostics",
      node: <DiagnosticsPanel data={diagnostics} />,
    };
  }

  const requestedTab = pick("tab");
  const fallbackKey = Object.keys(panels)[0];
  const activeKey =
    requestedTab && panels[requestedTab] ? requestedTab : fallbackKey;
  const activePanel = activeKey ? panels[activeKey] : null;

  return (
    <div className="space-y-4">
      {activePanel ? activePanel.node : null}
    </div>
  );
}
