"use server";

import { z } from "zod";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { WorkItem, type WorkItemActivityKind } from "@/models/WorkItem";
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
  kind: WorkItemActivityKind,
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

async function notifyWorkItemAssigned(opts: {
  assigneeId: unknown;
  title: string;
}) {
  if (!opts.assigneeId) return;
  try {
    await Notification.create({
      userId: opts.assigneeId as never,
      kind: "bug",
      title: "New work item assigned to you",
      body: `\u201C${opts.title}\u201D \u2014 open My Queue to submit your update.`,
      link: "/my-bugs",
    });
  } catch {
    // best-effort
  }
}

async function notifyWorkItemAccepted(opts: {
  assigneeId: unknown;
  title: string;
}) {
  if (!opts.assigneeId) return;
  try {
    await Notification.create({
      userId: opts.assigneeId as never,
      kind: "bug",
      title: "Work item closed \u2714",
      body: `Your update for \u201C${opts.title}\u201D was accepted. Nice work.`,
      link: "/my-bugs",
    });
  } catch {
    // best-effort
  }
}

const CreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional().default(""),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  assignedToId: z.string().trim().min(1, "Pick an assignee."),
  dueAt: z.string().trim().optional().nullable(),
});

export async function createWorkItemAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = CreateSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input.";
    return { ok: false as const, error: msg };
  }
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(parsed.data.assignedToId)) {
    return { ok: false as const, error: "Invalid assignee." };
  }
  const assignee = await User.findById(parsed.data.assignedToId)
    .select("username userId")
    .lean<{ _id: mongoose.Types.ObjectId; username: string; userId: string } | null>();
  if (!assignee) return { ok: false as const, error: "Assignee not found." };

  let dueAt: Date | null = null;
  if (parsed.data.dueAt) {
    const d = new Date(parsed.data.dueAt);
    if (!Number.isNaN(d.getTime())) dueAt = d;
  }

  const doc = await WorkItem.create({
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    status: "open",
    priority: parsed.data.priority,
    createdById: me._id,
    createdByName: me.username,
    createdByHandle: me.userId,
    assignedToId: assignee._id,
    assignedToName: assignee.username,
    assignedToHandle: assignee.userId,
    dueAt,
  });

  await recordAudit({
    action: "workitem.create",
    category: "create",
    targetType: "WorkItem",
    targetId: String(doc._id),
    meta: { title: parsed.data.title, assignee: assignee.userId },
  });

  await notifyWorkItemAssigned({
    assigneeId: assignee._id,
    title: parsed.data.title,
  });

  revalidatePath("/developer");
  revalidatePath("/my-bugs");
  return { ok: true as const, id: String(doc._id) };
}

const UpdateSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["open", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assignedToId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
});

export async function updateWorkItemAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = UpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid update." };
  }
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const item = await WorkItem.findById(parsed.data.id);
  if (!item) return { ok: false as const, error: "Not found." };

  const $set: Record<string, unknown> = {};
  if (parsed.data.status && parsed.data.status !== item.status) {
    $set.status = parsed.data.status;
    if (parsed.data.status === "done") $set.closedAt = new Date();
    else $set.closedAt = null;
  }
  if (parsed.data.priority) $set.priority = parsed.data.priority;
  if (parsed.data.title) $set.title = parsed.data.title;
  if (typeof parsed.data.description === "string") $set.description = parsed.data.description;

  let newAssigneeId: unknown = null;
  if (parsed.data.assignedToId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(parsed.data.assignedToId)) {
      return { ok: false as const, error: "Invalid assignee." };
    }
    const u = await User.findById(parsed.data.assignedToId)
      .select("username userId")
      .lean<{ _id: mongoose.Types.ObjectId; username: string; userId: string } | null>();
    if (!u) return { ok: false as const, error: "Assignee not found." };
    if (String(u._id) !== String(item.assignedToId)) {
      newAssigneeId = u._id;
      $set.assignedToId = u._id;
      $set.assignedToName = u.username;
      $set.assignedToHandle = u.userId;
      // Reset submission so the new owner can submit their own update.
      $set.submission = null;
      $set.needsReview = false;
    }
  }

  if (Object.keys($set).length === 0) {
    return { ok: true as const };
  }

  const activityEntries: unknown[] = [];
  if (parsed.data.status && parsed.data.status !== item.status) {
    activityEntries.push(
      makeActivity(me, "status_change", "", {
        from: item.status,
        to: parsed.data.status,
      }),
    );
  }
  if (newAssigneeId) {
    activityEntries.push(
      makeActivity(me, "assignment_change", "", {
        assigneeName: $set.assignedToName,
        assigneeHandle: $set.assignedToHandle,
      }),
    );
  }

  await WorkItem.updateOne(
    { _id: item._id },
    activityEntries.length
      ? { $set, $push: { activity: { $each: activityEntries } } }
      : { $set },
  );
  await recordAudit({
    action: "workitem.update",
    category: "update",
    targetType: "WorkItem",
    targetId: String(item._id),
    meta: $set,
  });

  if (newAssigneeId) {
    await notifyWorkItemAssigned({
      assigneeId: newAssigneeId,
      title: item.title,
    });
  }

  revalidatePath("/developer");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

export async function deleteWorkItemAction(id: string) {
  await requireAdminFeature("dev.workitems.manage");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const res = await WorkItem.deleteOne({ _id: id });
  if (res.deletedCount === 0) {
    return { ok: false as const, error: "Not found." };
  }
  await recordAudit({
    action: "workitem.delete",
    category: "delete",
    targetType: "WorkItem",
    targetId: id,
  });
  revalidatePath("/developer");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Assignee-facing submission flow (parallels the bug-report flow).
// ---------------------------------------------------------------------------

const SubmissionSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["done", "blocked", "wont_do"]),
  note: z
    .string()
    .trim()
    .min(3, "Add a short note (3+ chars).")
    .max(4000),
});

/**
 * Assignee submits their outcome. Locks until a manager accepts or reopens.
 *   - "done"    → proposed status `done`
 *   - "blocked" → status `blocked`, flagged for review
 *   - "wont_do" → stays `in_progress`, flagged — manager decides
 */
export async function submitWorkItemResolutionAction(payload: unknown) {
  const me = await requireUser();
  const parsed = SubmissionSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid payload.";
    return { ok: false as const, error: msg };
  }
  await connectDB();
  const item = await WorkItem.findById(parsed.data.id)
    .select("assignedToId status submission title")
    .lean();
  if (!item) return { ok: false as const, error: "Not found." };
  if (String(item.assignedToId) !== String(me._id)) {
    return { ok: false as const, error: "This work item isn't assigned to you." };
  }
  if (item.submission) {
    // Re-submission allowed; previous one is preserved in activity log.
  }
  if (item.status === "done") {
    return { ok: false as const, error: "This work item is already done." };
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

  const proposedStatus =
    parsed.data.kind === "done"
      ? "done"
      : parsed.data.kind === "blocked"
        ? "blocked"
        : "in_progress";

  await WorkItem.updateOne(
    { _id: parsed.data.id },
    {
      $set: {
        submission,
        needsReview: true,
        status: proposedStatus,
        closedAt: proposedStatus === "done" ? now : null,
      },
      $push: {
        activity: makeActivity(me, "submission", parsed.data.note, {
          kind: parsed.data.kind,
        }),
      },
    },
  );

  await recordAudit({
    action: "workitem.submit",
    category: "update",
    targetType: "WorkItem",
    targetId: parsed.data.id,
    meta: { kind: parsed.data.kind },
  });

  revalidatePath("/developer");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

/** Manager accepts the assignee's submission and closes the work item. */
export async function acceptWorkItemSubmissionAction(id: string) {
  const _auth = await assertFeature("dev.workitems.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const item = await WorkItem.findById(id)
    .select("submission assignedToId title status")
    .lean();
  if (!item) return { ok: false as const, error: "Not found." };
  if (!item.submission) {
    return { ok: false as const, error: "Nothing submitted yet." };
  }

  await WorkItem.updateOne(
    { _id: id },
    {
      $set: {
        status: "done",
        closedAt: new Date(),
        needsReview: false,
      },
      $push: {
        activity: makeActivity(me, "accept", ""),
      },
    },
  );

  await recordAudit({
    action: "workitem.accept",
    category: "update",
    targetType: "WorkItem",
    targetId: id,
  });

  await notifyWorkItemAccepted({
    assigneeId: item.assignedToId,
    title: item.title,
  });

  revalidatePath("/developer");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

/** Manager reopens — clears the submission so the assignee can submit again. */
export async function reopenWorkItemAction(id: string) {
  const _auth = await assertFeature("dev.workitems.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const item = await WorkItem.findById(id).select("assignedToId title").lean();
  if (!item) return { ok: false as const, error: "Not found." };

  await WorkItem.updateOne(
    { _id: id },
    {
      $set: {
        status: "in_progress",
        submission: null,
        needsReview: false,
        closedAt: null,
      },
      $push: {
        activity: makeActivity(me, "reopen", ""),
      },
    },
  );

  await recordAudit({
    action: "workitem.reopen",
    category: "update",
    targetType: "WorkItem",
    targetId: id,
  });

  await notifyWorkItemAssigned({
    assigneeId: item.assignedToId,
    title: item.title,
  });

  revalidatePath("/developer");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

// ===========================================================================
// Conversation: comments + request-changes
// ===========================================================================

const WICommentSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1, "Say something.").max(4000),
});

export async function addWorkItemCommentAction(payload: unknown) {
  const me = await requireUser();
  const parsed = WICommentSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid comment.";
    return { ok: false as const, error: msg };
  }
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const item = await WorkItem.findById(parsed.data.id)
    .select("assignedToId createdById activity title")
    .lean();
  if (!item) return { ok: false as const, error: "Not found." };

  const isAssignee = String(item.assignedToId) === String(me._id);
  const isCreator = String(item.createdById) === String(me._id);
  const canManageRes = await assertFeature("dev.workitems.manage");
  const canManage = canManageRes.ok;
  if (!isAssignee && !isCreator && !canManage) {
    return { ok: false as const, error: "You can't comment here." };
  }

  await WorkItem.updateOne(
    { _id: parsed.data.id },
    { $push: { activity: makeActivity(me, "comment", parsed.data.text) } },
  );

  // Notify assignee + previous commenters (excluding self & creator/reporter).
  const targets = new Set<string>();
  if (item.assignedToId) targets.add(String(item.assignedToId));
  for (const a of (item.activity ?? []) as Array<{ byId?: unknown; kind?: string }>) {
    if (a.kind === "comment" && a.byId) targets.add(String(a.byId));
  }
  targets.delete(String(me._id));
  // Work item "reporter" is the creator (manager). Stay silent until close.
  targets.delete(String(item.createdById));
  await Promise.all(
    Array.from(targets).map((uid) =>
      notify({
        userId: uid,
        title: `New comment on "${item.title}"`,
        body: `${me.username}: ${parsed.data.text.slice(0, 140)}`,
      }),
    ),
  );

  await recordAudit({
    category: "update",
    action: "workitem.comment",
    targetType: "WorkItem",
    targetId: parsed.data.id,
  });

  revalidatePath("/developer");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}

const WIRequestChangesSchema = z.object({
  id: z.string().trim().min(1),
  note: z
    .string()
    .trim()
    .min(3, "Tell the assignee what to change (3+ chars).")
    .max(4000),
});

export async function requestWorkItemChangesAction(payload: unknown) {
  const _auth = await assertFeature("dev.workitems.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = WIRequestChangesSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input.";
    return { ok: false as const, error: msg };
  }
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const item = await WorkItem.findById(parsed.data.id)
    .select("assignedToId title submission")
    .lean();
  if (!item) return { ok: false as const, error: "Not found." };
  if (!item.submission) {
    return { ok: false as const, error: "Nothing to request changes on yet." };
  }

  await WorkItem.updateOne(
    { _id: parsed.data.id },
    {
      $set: {
        submission: null,
        needsReview: false,
        status: "in_progress",
        closedAt: null,
      },
      $push: {
        activity: makeActivity(me, "request_changes", parsed.data.note),
      },
    },
  );

  await notify({
    userId: item.assignedToId,
    title: `Changes requested on "${item.title}"`,
    body: `${me.username}: ${parsed.data.note.slice(0, 200)}`,
  });

  await recordAudit({
    category: "update",
    action: "workitem.request_changes",
    targetType: "WorkItem",
    targetId: parsed.data.id,
  });

  revalidatePath("/developer");
  revalidatePath("/my-bugs");
  return { ok: true as const };
}
