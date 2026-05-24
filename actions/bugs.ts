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
      link: opts.link ?? "/developer",
    });
  } catch {
    // best-effort
  }
}

function bugLink(id: unknown) {
  return `/bugs/${String(id)}`;
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
    link: bugLink(opts.bugId),
  });
}

/** Extract @handles from free text and resolve to user records. */
async function resolveMentions(text: string) {
  const handles = Array.from(
    new Set(
      (text.match(/(?<=^|\s)@([a-z0-9_.-]{2,32})/gi) ?? []).map((m) =>
        m.replace(/^@/, "").toLowerCase(),
      ),
    ),
  );
  if (handles.length === 0) return [] as Array<{ userId: mongoose.Types.ObjectId; handle: string; name: string }>;
  const users = await User.find({ userId: { $in: handles } })
    .select("_id userId username")
    .lean();
  return users.map((u) => ({
    userId: u._id as mongoose.Types.ObjectId,
    handle: u.userId,
    name: u.username,
  }));
}

const DataUrlImage = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/i, "Invalid image")
  // ~900KB worst-case data URL ≈ ~670KB raw; we ask the client to keep them small.
  .max(900_000, "Image too large");

const BrowserContextSchema = z
  .object({
    viewport: z
      .object({ w: z.number().int().nonnegative(), h: z.number().int().nonnegative() })
      .nullable()
      .optional(),
    devicePixelRatio: z.number().nullable().optional(),
    locale: z.string().max(40).nullable().optional(),
    timezone: z.string().max(80).nullable().optional(),
    theme: z.string().max(40).nullable().optional(),
    referrer: z.string().max(500).nullable().optional(),
    consoleErrors: z
      .array(z.object({ at: z.string().max(40), msg: z.string().max(2000) }))
      .max(20)
      .optional(),
    buildId: z.string().max(80).nullable().optional(),
  })
  .nullable()
  .optional();

const SubmitSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(5).max(4000),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  pageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  screenshots: z.array(DataUrlImage).max(3).optional().default([]),
  browserContext: BrowserContextSchema,
  relatedTo: z.array(z.string()).max(5).optional(),
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
    browserContext: parsed.data.browserContext ?? null,
    relatedTo: (parsed.data.relatedTo ?? [])
      .filter((s) => mongoose.isValidObjectId(s))
      .slice(0, 5)
      .map((s) => new mongoose.Types.ObjectId(s)),
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
  const _auth = await assertFeature("dev.bug.manage");
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
      $push: {
        activity: makeActivity(me, "status_change", "", {
          status: parsed.data.status,
          from: prev.status,
        }),
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
  const _auth = await assertFeature("dev.bug.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  await connectDB();
  // Soft-delete: keep the row for audit; readers/loaders filter on deletedAt.
  await BugReport.updateOne(
    { _id: id, deletedAt: null },
    {
      $set: { deletedAt: new Date(), deletedById: me._id },
      $push: {
        activity: makeActivity(me, "system", "Bug deleted", { deleted: true }),
      },
    },
  );
  await recordAudit({
    category: "delete",
    action: "bug.report.delete",
    actor: me,
    targetType: "BugReport",
    targetId: id,
  });
  revalidatePath("/admin");
  revalidatePath("/developer");
  return { ok: true as const };
}

const AssignSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).nullable(),
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function assignBugReportAction(payload: unknown) {
  const _auth = await assertFeature("dev.bug.manage");
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
    revalidatePath("/developer");
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
  revalidatePath("/developer");
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
  revalidatePath("/developer");
  return { ok: true as const };
}

/** Admin confirms the assignee's submission and closes the bug. */
export async function acceptBugSubmissionAction(id: string) {
  const _auth = await assertFeature("dev.bug.manage");
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
  revalidatePath("/developer");
  return { ok: true as const, status: closedStatus };
}

const ReopenSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
  keepAssignee: z.boolean().default(true),
});

/** Admin reopens — clears the assignee submission so they can re-submit. */
export async function reopenBugAction(payload: unknown) {
  const _auth = await assertFeature("dev.bug.manage");
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
  revalidatePath("/developer");
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
  const canManageRes = await assertFeature("dev.bug.manage");
  const canManage = canManageRes.ok;
  const isDev = (await assertFeature("dev.member")).ok;
  if (!isReporter && !isAssignee && !canManage && !isDev) {
    return { ok: false as const, error: "You can't comment here." };
  }

  const mentions = await resolveMentions(parsed.data.text);
  const entry = {
    ...makeActivity(me, "comment", parsed.data.text),
    mentions: mentions.map((m) => ({ userId: m.userId, handle: m.handle, name: m.name })),
  };
  await BugReport.updateOne(
    { _id: parsed.data.id },
    { $push: { activity: entry } },
  );

  // Notify everyone in the conversation EXCEPT the reporter (per policy),
  // PLUS anyone explicitly @mentioned (mentions DO override the reporter rule
  // so an explicit ping reaches them).
  const targets = new Set<string>();
  if (bug.assignedTo) targets.add(String(bug.assignedTo));
  for (const a of (bug.activity ?? []) as Array<{ byId?: unknown; kind?: string }>) {
    if (a.kind === "comment" && a.byId) targets.add(String(a.byId));
  }
  const mentionIds = new Set(mentions.map((m) => String(m.userId)));
  targets.delete(String(me._id));
  // reporter is normally silent — but @mention overrides
  if (!mentionIds.has(String(bug.reporterId))) {
    targets.delete(String(bug.reporterId));
  }
  // ensure @mentions are always notified
  mentionIds.forEach((id) => {
    if (id !== String(me._id)) targets.add(id);
  });

  await Promise.all(
    Array.from(targets).map((uid) =>
      notify({
        userId: uid,
        title: mentionIds.has(uid)
          ? `${me.username} mentioned you on "${bug.title}"`
          : `New comment on "${bug.title}"`,
        body: `${me.username}: ${parsed.data.text.slice(0, 160)}`,
        link: bugLink(parsed.data.id),
      }),
    ),
  );

  await recordAudit({
    category: "update",
    action: "bug.report.comment",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
    meta: { mentions: mentions.map((m) => m.handle) },
  });

  revalidatePath("/admin");
  revalidatePath("/developer");
  revalidatePath(bugLink(parsed.data.id));
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
  const _auth = await assertFeature("dev.bug.manage");
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
  revalidatePath("/developer");
  return { ok: true as const };
}

// ===========================================================================
// Reactions
// ===========================================================================

const ALLOWED_EMOJI = ["👍", "❤️", "🎉", "👀", "🚀", "🙌", "😄", "🤔"] as const;

const ReactionSchema = z.object({
  bugId: z.string().min(1),
  activityId: z.string().min(1),
  emoji: z.enum(ALLOWED_EMOJI),
});

/**
 * Toggle a reaction on an activity entry. If the actor already reacted with
 * the same emoji, it's removed; otherwise it's added. Anyone with read
 * access (reporter / assignee / dev.bug.manage / dev.member) can react.
 */
export async function toggleBugReactionAction(payload: unknown) {
  const me = await requireUser();
  const parsed = ReactionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid reaction." };
  await connectDB();
  const bug = await BugReport.findById(parsed.data.bugId)
    .select("reporterId assignedTo activity._id activity.reactions")
    .lean();
  if (!bug) return { ok: false as const, error: "Bug not found." };

  const isReporter = String(bug.reporterId) === String(me._id);
  const isAssignee = bug.assignedTo && String(bug.assignedTo) === String(me._id);
  const canManageRes = await assertFeature("dev.bug.manage");
  const isDev = (await assertFeature("dev.member")).ok;
  if (!isReporter && !isAssignee && !canManageRes.ok && !isDev) {
    return { ok: false as const, error: "Can't react here." };
  }

  const entry = (bug.activity ?? []).find(
    (a: { _id?: unknown }) => String(a._id) === String(parsed.data.activityId),
  );
  if (!entry) return { ok: false as const, error: "Activity entry not found." };

  const existing = (entry as { reactions?: Array<{ emoji: string; byId: unknown }> }).reactions ?? [];
  const already = existing.find(
    (r) => r.emoji === parsed.data.emoji && String(r.byId) === String(me._id),
  );

  if (already) {
    await BugReport.updateOne(
      { _id: parsed.data.bugId, "activity._id": parsed.data.activityId },
      {
        $pull: {
          "activity.$.reactions": { emoji: parsed.data.emoji, byId: me._id },
        },
      },
    );
  } else {
    await BugReport.updateOne(
      { _id: parsed.data.bugId, "activity._id": parsed.data.activityId },
      {
        $push: {
          "activity.$.reactions": {
            emoji: parsed.data.emoji,
            byId: me._id,
            byHandle: me.userId,
            byName: me.username,
            at: new Date(),
          },
        },
      },
    );
  }

  revalidatePath("/admin");
  revalidatePath("/developer");
  revalidatePath(bugLink(parsed.data.bugId));
  return { ok: true as const, toggled: already ? "off" : "on" };
}

// ===========================================================================
// Edit / delete own comment
// ===========================================================================

const EditCommentSchema = z.object({
  bugId: z.string().min(1),
  activityId: z.string().min(1),
  text: z.string().trim().min(1).max(4000),
});

export async function editBugCommentAction(payload: unknown) {
  const me = await requireUser();
  const parsed = EditCommentSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (
    !mongoose.isValidObjectId(parsed.data.bugId) ||
    !mongoose.isValidObjectId(parsed.data.activityId)
  ) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const bug = await BugReport.findById(parsed.data.bugId)
    .select("activity._id activity.byId activity.kind activity.deletedAt")
    .lean();
  if (!bug) return { ok: false as const, error: "Bug not found." };
  const entry = (bug.activity ?? []).find(
    (a: { _id?: unknown }) => String(a._id) === String(parsed.data.activityId),
  ) as { _id?: unknown; byId?: unknown; kind?: string; deletedAt?: Date | null } | undefined;
  if (!entry) return { ok: false as const, error: "Comment not found." };
  if (entry.kind !== "comment") return { ok: false as const, error: "Not editable." };
  if (entry.deletedAt) return { ok: false as const, error: "Comment was deleted." };
  if (String(entry.byId) !== String(me._id)) {
    return { ok: false as const, error: "You can only edit your own comments." };
  }
  const mentions = await resolveMentions(parsed.data.text);
  const activityObjectId = new mongoose.Types.ObjectId(parsed.data.activityId);
  await BugReport.updateOne(
    { _id: parsed.data.bugId, "activity._id": activityObjectId },
    {
      $set: {
        "activity.$.text": parsed.data.text,
        "activity.$.editedAt": new Date(),
        "activity.$.mentions": mentions,
      },
    },
  );
  await recordAudit({
    category: "update",
    action: "bug.comment.edit",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.bugId,
    meta: {
      activityId: parsed.data.activityId,
      mentions: mentions.map((m) => m.handle),
      length: parsed.data.text.length,
    },
  });
  revalidatePath("/admin");
  revalidatePath("/developer");
  revalidatePath(bugLink(parsed.data.bugId));
  return { ok: true as const };
}

export async function deleteBugCommentAction(payload: unknown) {
  const me = await requireUser();
  const schema = z.object({ bugId: z.string().min(1), activityId: z.string().min(1) });
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (!mongoose.isValidObjectId(parsed.data.bugId) || !mongoose.isValidObjectId(parsed.data.activityId)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const bug = await BugReport.findById(parsed.data.bugId)
    .select("activity._id activity.byId activity.kind activity.deletedAt")
    .lean();
  if (!bug) return { ok: false as const, error: "Bug not found." };
  const entry = (bug.activity ?? []).find(
    (a: { _id?: unknown }) => String(a._id) === String(parsed.data.activityId),
  ) as { byId?: unknown; kind?: string; deletedAt?: Date | null } | undefined;
  if (!entry) return { ok: false as const, error: "Comment not found." };
  if (entry.kind !== "comment") return { ok: false as const, error: "Not deletable." };
  if (entry.deletedAt) return { ok: true as const }; // already deleted, idempotent
  if (String(entry.byId) !== String(me._id)) {
    return { ok: false as const, error: "You can only delete your own comments." };
  }
  // Soft-delete: keep the activity row so the thread keeps its order and
  // permalinks stay valid; the UI renders a tombstone.
  const now = new Date();
  const activityObjectId = new mongoose.Types.ObjectId(parsed.data.activityId);
  await BugReport.updateOne(
    { _id: parsed.data.bugId, "activity._id": activityObjectId },
    {
      $set: {
        "activity.$.deletedAt": now,
        "activity.$.deletedById": me._id,
        "activity.$.deletedByName": me.username,
        "activity.$.deletedByHandle": me.userId,
        // Also clear the text + mentions so the deleted content never leaks
        // (the tombstone shows "This message was deleted").
        "activity.$.text": "",
        "activity.$.mentions": [],
        "activity.$.reactions": [],
      },
    },
  );
  await recordAudit({
    category: "delete",
    action: "bug.comment.delete",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.bugId,
    meta: { activityId: parsed.data.activityId, byManager: false },
  });
  revalidatePath("/admin");
  revalidatePath("/developer");
  revalidatePath(bugLink(parsed.data.bugId));
  return { ok: true as const };
}

// ===========================================================================
// Mark-as-read (for unread badges)
// ===========================================================================

export async function markBugReadAction(bugId: string) {
  if (!bugId || typeof bugId !== "string") return { ok: false as const };
  const me = await requireUser();
  await connectDB();
  await BugReport.updateOne(
    { _id: bugId },
    { $set: { [`viewerState.${String(me._id)}.lastReadAt`]: new Date() } },
  );
  return { ok: true as const };
}

// ===========================================================================
// SLA / due date
// ===========================================================================

const DueSchema = z.object({
  id: z.string().min(1),
  /** ISO timestamp or null to clear. */
  dueAt: z.string().datetime().nullable(),
});

export async function setBugDueAction(payload: unknown) {
  const _auth = await assertFeature("dev.bug.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = DueSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  await connectDB();
  const nextDue = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  await BugReport.updateOne(
    { _id: parsed.data.id },
    {
      $set: { dueAt: nextDue },
      $push: {
        activity: makeActivity(me, "due_change", "", {
          dueAt: nextDue?.toISOString() ?? null,
        }),
      },
    },
  );
  await recordAudit({
    category: "update",
    action: "bug.report.due",
    actor: me,
    targetType: "BugReport",
    targetId: parsed.data.id,
    meta: { dueAt: nextDue?.toISOString() ?? null },
  });
  revalidatePath("/admin");
  revalidatePath("/developer");
  revalidatePath(bugLink(parsed.data.id));
  return { ok: true as const };
}

// ===========================================================================
// Bulk admin actions
// ===========================================================================

const BulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  op: z.enum([
    "accept",
    "reopen",
    "assign",
    "unassign",
    "status",
    "delete",
    "due",
  ]),
  payload: z
    .object({
      userId: z.string().nullable().optional(),
      status: z.enum(["open", "in_progress", "resolved", "wont_fix"]).optional(),
      dueAt: z.string().datetime().nullable().optional(),
      reason: z.string().max(500).optional(),
      keepAssignee: z.boolean().optional(),
    })
    .optional()
    .default({}),
});

/**
 * Apply the same operation to multiple bugs at once. Each item runs through
 * the matching single-bug action so audit / notifications stay consistent.
 * Returns per-id success/failure for the toolbar.
 */
export async function bulkBugAction(payload: unknown) {
  const parsed = BulkSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid bulk request." };
  const { ids, op, payload: data } = parsed.data;
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const id of ids) {
    try {
      let r: { ok: boolean; error?: string } = { ok: false, error: "Unknown op" };
      if (op === "accept") {
        r = await acceptBugSubmissionAction(id);
      } else if (op === "reopen") {
        r = await reopenBugAction({
          id,
          reason: data.reason,
          keepAssignee: data.keepAssignee ?? true,
        });
      } else if (op === "assign") {
        r = await assignBugReportAction({ id, userId: data.userId ?? null });
      } else if (op === "unassign") {
        r = await assignBugReportAction({ id, userId: null });
      } else if (op === "status") {
        r = await updateBugReportAction({ id, status: data.status ?? "open" });
      } else if (op === "delete") {
        r = await deleteBugReportAction(id);
      } else if (op === "due") {
        r = await setBugDueAction({ id, dueAt: data.dueAt ?? null });
      }
      results.push({ id, ok: r.ok, error: r.ok ? undefined : (r as { error?: string }).error });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }
  return { ok: true as const, results };
}

// ===========================================================================
// CSV export
// ===========================================================================

function csvEscape(s: unknown): string {
  const str = s == null ? "" : String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function exportBugsCsvAction() {
  const _auth = await assertFeature("dev.bug.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  await connectDB();
  const rows = await BugReport.find({ deletedAt: null })
    .select(
      "title severity status reporterName reporterHandle assignedToName assignedToHandle createdAt updatedAt resolvedAt dueAt needsAdminReview submission.kind pageUrl",
    )
    .sort({ createdAt: -1 })
    .lean();

  const header = [
    "id",
    "title",
    "severity",
    "status",
    "needsAdminReview",
    "submissionKind",
    "reporter",
    "reporterHandle",
    "assignee",
    "assigneeHandle",
    "createdAt",
    "updatedAt",
    "resolvedAt",
    "dueAt",
    "pageUrl",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r._id,
      csvEscape(r.title),
      r.severity,
      r.status,
      r.needsAdminReview ? "1" : "0",
      r.submission?.kind ?? "",
      csvEscape(r.reporterName ?? ""),
      r.reporterHandle ?? "",
      csvEscape(r.assignedToName ?? ""),
      r.assignedToHandle ?? "",
      r.createdAt instanceof Date ? r.createdAt.toISOString() : "",
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : "",
      r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : "",
      r.dueAt instanceof Date ? r.dueAt.toISOString() : "",
      csvEscape(r.pageUrl ?? ""),
    ].join(","),
  );
  await recordAudit({
    category: "action",
    action: "bug.csv.export",
    actor: me,
    targetType: "BugReport",
    meta: { count: rows.length },
  });
  return { ok: true as const, csv: [header, ...lines].join("\n") };
}

// ===========================================================================
// Duplicate detection (fuzzy by title)
// ===========================================================================

/**
 * Suggest up to 5 existing open/in-progress bugs whose title overlaps with the
 * proposed title. Cheap token-overlap scoring — good enough for 13 reporters.
 * Returns `[]` if input is too short or DB is empty.
 */
export async function findDuplicateBugsAction(rawTitle: string) {
  await requireUser();
  const q = (rawTitle ?? "").trim();
  if (q.length < 6) return { ok: true as const, results: [] };
  await connectDB();
  const tokens = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .slice(0, 6);
  if (tokens.length === 0) return { ok: true as const, results: [] };
  const regex = new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const rows = await BugReport.find({
    status: { $in: ["open", "in_progress"] },
    deletedAt: null,
    title: regex,
  })
    .select("title severity status assignedToName createdAt")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const score = (t: string) =>
    tokens.reduce((acc, tok) => (t.toLowerCase().includes(tok) ? acc + 1 : acc), 0);
  const ranked = rows
    .map((r) => ({ ...r, _score: score(r.title) }))
    .filter((r) => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5)
    .map((r) => ({
      id: String(r._id),
      title: r.title,
      severity: r.severity,
      status: r.status,
      assigneeName: r.assignedToName ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      score: r._score / tokens.length,
    }));
  return { ok: true as const, results: ranked };
}

// ===========================================================================
// Mention candidates (for @mention picker)
// ===========================================================================

/** Returns active users matching a fuzzy prefix on handle or name. */
export async function searchMentionableUsersAction(q: string) {
  await requireUser();
  const trimmed = (q ?? "").trim().slice(0, 40);
  await connectDB();
  const filter = trimmed
    ? {
        $or: [
          { userId: { $regex: trimmed, $options: "i" } },
          { username: { $regex: trimmed, $options: "i" } },
        ],
      }
    : {};
  const rows = await User.find(filter).select("userId username").limit(8).lean();
  return {
    ok: true as const,
    results: rows.map((u) => ({
      id: String(u._id),
      handle: u.userId,
      name: u.username,
    })),
  };
}
