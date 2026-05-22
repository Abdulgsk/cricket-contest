"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { connectDB } from "@/lib/db";
import { BugReport } from "@/models/BugReport";
import { User } from "@/models/User";
import { requireUser, requireAdminFeature, assertFeature } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const SubmitSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(5).max(4000),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  pageUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function submitBugReportAction(payload: unknown) {
  const me = await requireUser();
  const parsed = SubmitSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: "Please fill title and description (3+ chars)." };
  }
  await connectDB();
  const h = await headers();
  const userAgent = h.get("user-agent") ?? null;

  const doc = await BugReport.create({
    reporterId: me._id,
    reporterHandle: me.userId,
    reporterName: me.username,
    title: parsed.data.title,
    description: parsed.data.description,
    severity: parsed.data.severity,
    pageUrl: parsed.data.pageUrl?.trim() || null,
    userAgent,
    status: "open",
  });

  await recordAudit({
    category: "create",
    action: "bug.report.create",
    actor: me,
    targetType: "BugReport",
    targetId: String(doc._id),
    meta: {
      title: parsed.data.title,
      severity: parsed.data.severity,
    },
  });

  revalidatePath("/admin");
  return { ok: true as const, id: String(doc._id) };
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["open", "in_progress", "resolved", "wont_fix"]),
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function updateBugReportAction(payload: unknown) {
  const _auth = await assertFeature("bugs.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = UpdateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();
  const isResolved = parsed.data.status === "resolved" || parsed.data.status === "wont_fix";
  await BugReport.updateOne(
    { _id: parsed.data.id },
    {
      $set: {
        status: parsed.data.status,
        adminNotes: parsed.data.adminNotes ?? null,
        resolvedAt: isResolved ? new Date() : null,
        resolvedBy: isResolved ? me._id : null,
      },
    },
  );
  await recordAudit({
    category: "update",
    action: "bug.report.update",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
    meta: { status: parsed.data.status },
  });
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function deleteBugReportAction(id: string) {
  const _auth = await assertFeature("bugs.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  await connectDB();
  await BugReport.deleteOne({ _id: id });
  await recordAudit({
    category: "delete",
    action: "bug.report.delete",
    actor: me,
    targetType: "BugReport",
    targetId: id,
  });
  revalidatePath("/admin");
  return { ok: true as const };
}

const AssignSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).nullable(),
});

export async function assignBugReportAction(payload: unknown) {
  const _auth = await assertFeature("bugs.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = AssignSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();

  if (parsed.data.userId === null) {
    await BugReport.updateOne(
      { _id: parsed.data.id },
      {
        $set: {
          assignedTo: null,
          assignedToHandle: null,
          assignedToName: null,
          assignedAt: null,
          assignedBy: null,
        },
      },
    );
    await recordAudit({
      category: "update",
      action: "bug.report.unassign",
      actor: me,
      targetType: "BugReport",
      targetId: parsed.data.id,
    });
    revalidatePath("/admin");
    revalidatePath("/my-bugs");
    return { ok: true as const };
  }

  const target = await User.findById(parsed.data.userId).select("userId username").lean();
  if (!target) return { ok: false as const, error: "User not found" };

  await BugReport.updateOne(
    { _id: parsed.data.id },
    {
      $set: {
        assignedTo: target._id,
        assignedToHandle: target.userId,
        assignedToName: target.username,
        assignedAt: new Date(),
        assignedBy: me._id,
      },
    },
  );
  // If still "open", promote to in_progress for clarity.
  await BugReport.updateOne(
    { _id: parsed.data.id, status: "open" },
    { $set: { status: "in_progress" } },
  );

  await recordAudit({
    category: "update",
    action: "bug.report.assign",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
    meta: { assignee: target.userId },
  });

  revalidatePath("/admin");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

const ResolutionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["fixed", "blocked", "wont_fix"]),
  note: z
    .string()
    .trim()
    .min(3, "Add a short note (3+ chars).")
    .max(4000),
});

/**
 * Assignee writes their outcome exactly once. After this fires the bug enters
 * "needs admin review" and the assignee can't write again until an admin
 * reopens it. Kinds:
 *   - "fixed"    → proposed status `resolved`
 *   - "blocked"  → stays `in_progress`, flagged for admin attention
 *   - "wont_fix" → proposed status `wont_fix`
 *
 * The admin makes the final call via `acceptBugSubmissionAction` /
 * `reopenBugAction`.
 */
export async function submitBugResolutionAction(payload: unknown) {
  const me = await requireUser();
  const parsed = ResolutionSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid payload";
    return { ok: false as const, error: msg };
  }
  await connectDB();
  const bug = await BugReport.findById(parsed.data.id)
    .select("assignedTo status submission")
    .lean();
  if (!bug) return { ok: false as const, error: "Bug not found" };
  if (!bug.assignedTo || String(bug.assignedTo) !== String(me._id)) {
    return { ok: false as const, error: "This bug isn't assigned to you." };
  }
  if (bug.submission) {
    return {
      ok: false as const,
      error: "You already submitted. Wait for the admin to review.",
    };
  }
  if (bug.status === "resolved" || bug.status === "wont_fix") {
    return { ok: false as const, error: "This bug is already closed." };
  }

  const now = new Date();
  const submission = {
    kind: parsed.data.kind,
    note: parsed.data.note,
    submittedAt: now,
    submittedById: me._id,
    submittedByHandle: me.userId,
    submittedByName: me.username,
  };

  // Compute the proposed status. Admin confirms via accept; UI shows the
  // "needs review" chip until then.
  const proposedStatus =
    parsed.data.kind === "fixed"
      ? "resolved"
      : parsed.data.kind === "wont_fix"
        ? "wont_fix"
        : "in_progress";

  await BugReport.updateOne(
    { _id: parsed.data.id },
    {
      $set: {
        submission,
        needsAdminReview: true,
        status: proposedStatus,
        // Keep the legacy free-text field populated for older readers.
        resolutionNote: parsed.data.note,
        resolvedAt: parsed.data.kind === "fixed" ? now : null,
        resolvedBy: parsed.data.kind === "fixed" ? me._id : null,
      },
    },
  );

  await recordAudit({
    category: "update",
    action: `bug.report.submission.${parsed.data.kind}`,
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
    meta: { kind: parsed.data.kind },
  });

  revalidatePath("/admin");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

/** Admin confirms the assignee's submission and closes the bug. */
export async function acceptBugSubmissionAction(id: string) {
  const _auth = await assertFeature("bugs.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  await connectDB();
  const bug = await BugReport.findById(id).select("submission status").lean();
  if (!bug) return { ok: false as const, error: "Bug not found" };
  if (!bug.submission) {
    return { ok: false as const, error: "Nothing to accept — no submission yet." };
  }
  const closedStatus =
    bug.submission.kind === "wont_fix" ? "wont_fix" : "resolved";
  await BugReport.updateOne(
    { _id: id },
    {
      $set: {
        status: closedStatus,
        needsAdminReview: false,
        resolvedAt: new Date(),
        resolvedBy: me._id,
      },
    },
  );
  await recordAudit({
    category: "update",
    action: "bug.report.accept",
    actor: me,
    targetType: "BugReport",
    targetId: id,
    meta: { kind: bug.submission.kind, closedStatus },
  });
  revalidatePath("/admin");
  revalidatePath("/my-bugs");
  return { ok: true as const, status: closedStatus };
}

const ReopenSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
  keepAssignee: z.boolean().default(true),
});

/** Admin reopens — clears the assignee submission so they can re-submit. */
export async function reopenBugAction(payload: unknown) {
  const _auth = await assertFeature("bugs.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = ReopenSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };

  await connectDB();
  const bug = await BugReport.findById(parsed.data.id)
    .select("assignedTo")
    .lean();
  if (!bug) return { ok: false as const, error: "Bug not found" };

  const update: Record<string, unknown> = {
    status: bug.assignedTo && parsed.data.keepAssignee ? "in_progress" : "open",
    needsAdminReview: false,
    submission: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedBy: null,
  };
  if (!parsed.data.keepAssignee) {
    Object.assign(update, {
      assignedTo: null,
      assignedToHandle: null,
      assignedToName: null,
      assignedAt: null,
      assignedBy: null,
    });
  }
  if (parsed.data.reason) {
    update.adminNotes = parsed.data.reason;
  }

  await BugReport.updateOne({ _id: parsed.data.id }, { $set: update });
  await recordAudit({
    category: "update",
    action: "bug.report.reopen",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
    meta: { keepAssignee: parsed.data.keepAssignee, reason: parsed.data.reason ?? null },
  });
  revalidatePath("/admin");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}
