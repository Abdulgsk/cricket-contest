"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { connectDB } from "@/lib/db";
import { BugReport } from "@/models/BugReport";
import { User } from "@/models/User";
import { requireUser, requireAdminFeature } from "@/lib/rbac";
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
  const me = await requireAdminFeature("bugs.manage");
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
  const me = await requireAdminFeature("bugs.manage");
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
  const me = await requireAdminFeature("bugs.manage");
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
  resolutionNote: z.string().trim().min(3).max(4000),
});

export async function submitBugResolutionAction(payload: unknown) {
  const me = await requireUser();
  const parsed = ResolutionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: "Add a short note describing your fix (3+ chars)." };
  }
  await connectDB();
  const bug = await BugReport.findById(parsed.data.id).select("assignedTo status").lean();
  if (!bug) return { ok: false as const, error: "Bug not found" };
  if (!bug.assignedTo || String(bug.assignedTo) !== String(me._id)) {
    return { ok: false as const, error: "This bug isn't assigned to you." };
  }
  if (bug.status === "resolved" || bug.status === "wont_fix") {
    return { ok: false as const, error: "This bug is already closed." };
  }

  await BugReport.updateOne(
    { _id: parsed.data.id },
    {
      $set: {
        status: "resolved",
        resolutionNote: parsed.data.resolutionNote,
        resolvedAt: new Date(),
        resolvedBy: me._id,
      },
    },
  );

  await recordAudit({
    category: "update",
    action: "bug.report.resolve",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
  });

  revalidatePath("/admin");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}
