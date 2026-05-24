import { connectDB } from "@/lib/db";
import { BugReport, type IBugActivity } from "@/models/BugReport";
import type { BugDetail } from "@/components/bug/bug-detail-panel";
import type { BugThreadEntry } from "@/components/bug-activity-thread";

function serializeActivity(raw: IBugActivity[]): BugThreadEntry[] {
  return (raw ?? []).map((a) => ({
    _id: String(a._id),
    at: new Date(a.at).toISOString(),
    byId: a.byId ? String(a.byId) : null,
    byName: a.byName,
    byHandle: a.byHandle,
    kind: a.kind,
    text: a.text ?? "",
    editedAt: a.editedAt ? new Date(a.editedAt).toISOString() : null,
    meta: (a.meta as Record<string, unknown> | null | undefined) ?? null,
    mentions: (a.mentions ?? []).map((m) => ({
      userId: String(m.userId),
      handle: m.handle,
      name: m.name,
    })),
    reactions: (a.reactions ?? []).map((r) => ({
      emoji: r.emoji,
      byId: String(r.byId),
      byHandle: r.byHandle,
      byName: r.byName,
    })),
  }));
}

/**
 * Load and serialize a single bug to the shape `BugDetailPanel` expects.
 * Pulls related bugs (titles + status only) for the relatedTo strip.
 */
export async function getBugDetail(bugId: string): Promise<BugDetail | null> {
  await connectDB();
  const raw = await BugReport.findById(bugId).lean();
  if (!raw) return null;

  let relatedTo: BugDetail["relatedTo"] = [];
  if (Array.isArray(raw.relatedTo) && raw.relatedTo.length) {
    const rows = await BugReport.find({ _id: { $in: raw.relatedTo } })
      .select("title status")
      .lean();
    relatedTo = rows.map((r) => ({
      id: String(r._id),
      title: r.title,
      status: r.status as BugDetail["status"],
    }));
  }

  return {
    id: String(raw._id),
    title: raw.title,
    description: raw.description,
    severity: raw.severity as BugDetail["severity"],
    status: raw.status as BugDetail["status"],
    needsAdminReview: !!raw.needsAdminReview,
    reporter: {
      id: String(raw.reporterId),
      handle: raw.reporterHandle ?? "—",
      name: raw.reporterName ?? "—",
    },
    assignee: raw.assignedTo
      ? {
          id: String(raw.assignedTo),
          handle: raw.assignedToHandle ?? "—",
          name: raw.assignedToName ?? "—",
        }
      : null,
    pageUrl: raw.pageUrl ?? null,
    adminNotes: raw.adminNotes ?? null,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : new Date().toISOString(),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : new Date().toISOString(),
    resolvedAt: raw.resolvedAt instanceof Date ? raw.resolvedAt.toISOString() : null,
    dueAt: raw.dueAt instanceof Date ? raw.dueAt.toISOString() : null,
    screenshots: Array.isArray(raw.screenshots) ? raw.screenshots : [],
    submission: raw.submission
      ? {
          kind: raw.submission.kind as BugDetail["submission"] extends infer T ? T extends null ? never : T extends { kind: infer K } ? K : never : never,
          note: raw.submission.note,
          submittedAt:
            raw.submission.submittedAt instanceof Date
              ? raw.submission.submittedAt.toISOString()
              : String(raw.submission.submittedAt),
          submittedByHandle: raw.submission.submittedByHandle,
          submittedByName: raw.submission.submittedByName,
        }
      : null,
    browserContext: raw.browserContext ?? null,
    userAgent: raw.userAgent ?? null,
    activity: serializeActivity(raw.activity as IBugActivity[]),
    relatedTo,
  };
}

/** Lightweight projection used in list views — strips screenshots & activity. */
export type BugRowLite = {
  id: string;
  title: string;
  severity: BugDetail["severity"];
  status: BugDetail["status"];
  needsAdminReview: boolean;
  reporterName: string;
  reporterHandle: string;
  assigneeName: string | null;
  assigneeHandle: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  submissionKind: BugDetail["submission"] extends infer T ? T extends null ? null : T extends { kind: infer K } ? K : null : null;
  hasScreenshots: boolean;
  commentCount: number;
};
