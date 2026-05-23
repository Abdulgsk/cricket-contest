"use server";

import { z } from "zod";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { connectDB } from "@/lib/db";
import { BugReport, type BugActivityKind } from "@/models/BugReport";
import { User } from "@/models/User";
import { Notification } from "@/models/Notification";
import { requireUser, requireAdminFeature, assertFeature } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

type Actor = {
  _id: mongoose.Types.ObjectId | string;
  userId: string;
  username: string;
};

function makeActivity(
  actor: Actor,
  kind: BugActivityKind,
  text?: string,
  meta?: Record<string, unknown>,
) {
  return {
    at: new Date(),
    byId: actor._id,
    byName: actor.username,
    byHandle: actor.userId,
    kind,
    text: text ?? "",
    meta: meta ?? null,
  };
}

/** Best-effort notification helper. */
async function notify(opts: {
  userId: unknown;
  title: string;
  body: string;
  link?: string;
}) {
  if (!opts.userId) return;
  try {
    await Notification.create({
      userId: opts.userId as never,
      kind: "bug",
      title: opts.title,
      body: opts.body,
      link: opts.link ?? "/my-bugs",
    });
  } catch {
    // best-effort
  }
}

/**
 * Send a "your bug was fixed" notification to the reporter. Best-effort:
 * notifications never block the admin's close action.
 */
async function notifyBugResolved(opts: {
  reporterId: unknown;
  bugId: string;
  title: string;
}) {
  await notify({
    userId: opts.reporterId,
    title: "Your bug report was fixed\u00a0\u{1F389}",
    body: `Thanks for reporting \u201C${opts.title}\u201D \u2014 it\u2019s been resolved. Appreciate you keeping the app sharp!`,
    link: "/my-bugs",
  });
}

const DataUrlImage = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/i, "Invalid image")
  // ~900KB worst-case data URL ≈ ~670KB raw; we ask the client to keep them small.
  .max(900_000, "Image too large");

const SubmitSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(5).max(4000),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  pageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  screenshots: z.array(DataUrlImage).max(3).optional().default([]),
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
    screenshots: parsed.data.screenshots ?? [],
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
  const prev = await BugReport.findById(parsed.data.id)
    .select("status reporterId title")
    .lean();
  if (!prev) return { ok: false as const, error: "Bug not found" };
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
  // Notify only when transitioning into "resolved" (the actual fix);
  // wont_fix is silent so we don't ping users about declined reports.
  if (parsed.data.status === "resolved" && prev.status !== "resolved") {
    await notifyBugResolved({
      reporterId: prev.reporterId,
      bugId: parsed.data.id,
      title: prev.title,
    });
  }
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
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function assignBugReportAction(payload: unknown) {
  const _auth = await assertFeature("bugs.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = AssignSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();

  if (parsed.data.userId === null) {
    const unset: Record<string, unknown> = {
      assignedTo: null,
      assignedToHandle: null,
      assignedToName: null,
      assignedAt: null,
      assignedBy: null,
    };
    // Only overwrite notes if the admin actually typed something; an
    // omitted field leaves the existing note in place.
    if (parsed.data.adminNotes !== undefined) {
      unset.adminNotes = parsed.data.adminNotes || null;
    }
    await BugReport.updateOne(
      { _id: parsed.data.id },
      {
        $set: unset,
        $push: {
          activity: makeActivity(me, "assignment_change", parsed.data.adminNotes ?? "", {
            unassigned: true,
          }),
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

  const set: Record<string, unknown> = {
    assignedTo: target._id,
    assignedToHandle: target.userId,
    assignedToName: target.username,
    assignedAt: new Date(),
    assignedBy: me._id,
  };
  if (parsed.data.adminNotes !== undefined) {
    set.adminNotes = parsed.data.adminNotes || null;
  }
  await BugReport.updateOne(
    { _id: parsed.data.id },
    {
      $set: set,
      $push: {
        activity: makeActivity(me, "assignment_change", parsed.data.adminNotes ?? "", {
          assigneeHandle: target.userId,
          assigneeName: target.username,
        }),
      },
    },
  );
  // If still "open", promote to in_progress for clarity.
  await BugReport.updateOne(
    { _id: parsed.data.id, status: "open" },
    { $set: { status: "in_progress" } },
  );

  // Notify the new assignee.
  await notify({
    userId: target._id,
    title: "A bug was assigned to you",
    body: parsed.data.adminNotes
      ? `${me.username}: \u201C${parsed.data.adminNotes}\u201D`
      : `\u201C${(await BugReport.findById(parsed.data.id).select("title").lean())?.title ?? ""}\u201D \u2014 open My queue.`,
  });

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
    // Re-submission is allowed (previous one becomes part of the activity log).
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
      $push: {
        activity: makeActivity(me, "submission", parsed.data.note, {
          kind: parsed.data.kind,
        }),
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
  const bug = await BugReport.findById(id)
    .select("submission status reporterId title")
    .lean();
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
      $push: {
        activity: makeActivity(me, "accept", "", { closedStatus }),
      },
    },
  );
  if (closedStatus === "resolved" && bug.status !== "resolved") {
    await notifyBugResolved({
      reporterId: bug.reporterId,
      bugId: id,
      title: bug.title,
    });
  }
  // Also tell the assignee their work was accepted.
  if (bug.submission?.submittedById) {
    await notify({
      userId: bug.submission.submittedById,
      title: "Your bug submission was accepted \u2713",
      body: `\u201C${bug.title}\u201D \u2014 ${me.username} closed it as ${closedStatus === "resolved" ? "fixed" : "won\u2019t fix"}.`,
    });
  }
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

  await BugReport.updateOne(
    { _id: parsed.data.id },
    {
      $set: update,
      $push: {
        activity: makeActivity(me, "reopen", parsed.data.reason ?? "", {
          keepAssignee: parsed.data.keepAssignee,
        }),
      },
    },
  );
  // Tell the (still-assigned) assignee they're back on the hook.
  if (parsed.data.keepAssignee && bug.assignedTo) {
    await notify({
      userId: bug.assignedTo,
      title: "A bug was reopened for you",
      body: parsed.data.reason
        ? `${me.username}: \u201C${parsed.data.reason}\u201D`
        : `${me.username} reopened a bug assigned to you. Open My queue.`,
    });
  }
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

// ===========================================================================
// Conversation: comments + request-changes
// ===========================================================================

const CommentSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1, "Say something.").max(4000),
});

/**
 * Anyone with access to the bug (reporter, assignee, manager) can comment.
 * Notifies the other active participants in the thread (assignee + previous
 * commenters), but never the reporter unless they're also a participant.
 */
export async function addBugCommentAction(payload: unknown) {
  const me = await requireUser();
  const parsed = CommentSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid comment.";
    return { ok: false as const, error: msg };
  }
  await connectDB();
  const bug = await BugReport.findById(parsed.data.id)
    .select("reporterId assignedTo activity title")
    .lean();
  if (!bug) return { ok: false as const, error: "Bug not found." };

  const isReporter = String(bug.reporterId) === String(me._id);
  const isAssignee = bug.assignedTo && String(bug.assignedTo) === String(me._id);
  const canManageRes = await assertFeature("bugs.manage");
  const canManage = canManageRes.ok;
  if (!isReporter && !isAssignee && !canManage) {
    return { ok: false as const, error: "You can't comment here." };
  }

  const entry = makeActivity(me, "comment", parsed.data.text);
  await BugReport.updateOne(
    { _id: parsed.data.id },
    { $push: { activity: entry } },
  );

  // Notify everyone in the conversation EXCEPT the reporter (per policy).
  const targets = new Set<string>();
  if (bug.assignedTo) targets.add(String(bug.assignedTo));
  for (const a of (bug.activity ?? []) as Array<{ byId?: unknown; kind?: string }>) {
    if (a.kind === "comment" && a.byId) targets.add(String(a.byId));
  }
  targets.delete(String(me._id));
  targets.delete(String(bug.reporterId)); // reporter is silent until "fixed"
  await Promise.all(
    Array.from(targets).map((uid) =>
      notify({
        userId: uid,
        title: `New comment on "${bug.title}"`,
        body: `${me.username}: ${parsed.data.text.slice(0, 140)}`,
      }),
    ),
  );

  await recordAudit({
    category: "update",
    action: "bug.report.comment",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
  });

  revalidatePath("/admin");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

const RequestChangesSchema = z.object({
  id: z.string().trim().min(1),
  note: z
    .string()
    .trim()
    .min(3, "Tell the assignee what to change (3+ chars).")
    .max(4000),
});

/**
 * Manager rejects a submission and sends it back to the assignee with a
 * mandatory note. Submission is cleared; status reverts to in_progress so the
 * assignee can submit a fresh outcome.
 */
export async function requestBugChangesAction(payload: unknown) {
  const _auth = await assertFeature("bugs.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = RequestChangesSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input.";
    return { ok: false as const, error: msg };
  }
  await connectDB();
  const bug = await BugReport.findById(parsed.data.id)
    .select("assignedTo title submission")
    .lean();
  if (!bug) return { ok: false as const, error: "Bug not found." };
  if (!bug.submission) {
    return { ok: false as const, error: "Nothing to request changes on yet." };
  }

  await BugReport.updateOne(
    { _id: parsed.data.id },
    {
      $set: {
        submission: null,
        needsAdminReview: false,
        status: bug.assignedTo ? "in_progress" : "open",
        resolutionNote: null,
        resolvedAt: null,
        resolvedBy: null,
      },
      $push: {
        activity: makeActivity(me, "request_changes", parsed.data.note),
      },
    },
  );

  if (bug.assignedTo) {
    await notify({
      userId: bug.assignedTo,
      title: `Changes requested on "${bug.title}"`,
      body: `${me.username}: ${parsed.data.note.slice(0, 200)}`,
    });
  }

  await recordAudit({
    category: "update",
    action: "bug.report.request_changes",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
  });

  revalidatePath("/admin");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}
