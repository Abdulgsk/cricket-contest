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
      link: opts.link ?? "/developer",
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
      link: "/developer",
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
      link: "/developer",
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
  revalidatePath("/developer");
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
  revalidatePath("/developer");
  return { ok: true as const };
}

export async function deleteWorkItemAction(id: string) {
  const _auth = await assertFeature("dev.workitems.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const res = await WorkItem.updateOne(
    { _id: id, deletedAt: null },
    { $set: { deletedAt: new Date(), deletedById: me._id } },
  );
  if (res.matchedCount === 0) {
    return { ok: false as const, error: "Not found." };
  }
  await recordAudit({
    action: "workitem.delete",
    category: "delete",
    targetType: "WorkItem",
    targetId: id,
  });
  revalidatePath("/developer");
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
  revalidatePath("/developer");
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
  revalidatePath("/developer");
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
  revalidatePath("/developer");
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
  const isDev = (await assertFeature("dev.member")).ok;
  if (!isAssignee && !isCreator && !canManage && !isDev) {
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
  // @mention: anyone matched by @handle gets added as a watcher + notified.
  const mentions = Array.from(
    new Set(
      (parsed.data.text.match(/@([a-z0-9._-]{2,40})/gi) ?? []).map((m) =>
        m.slice(1).toLowerCase(),
      ),
    ),
  ).slice(0, 10);
  let mentionedUsers: Array<{ _id: mongoose.Types.ObjectId; username: string }> = [];
  if (mentions.length > 0) {
    mentionedUsers = await User.find({ userId: { $in: mentions } })
      .select({ _id: 1, username: 1 })
      .lean<Array<{ _id: mongoose.Types.ObjectId; username: string }>>();
    for (const u of mentionedUsers) targets.add(String(u._id));
    if (mentionedUsers.length > 0) {
      await WorkItem.updateOne(
        { _id: parsed.data.id },
        { $addToSet: { watchers: { $each: mentionedUsers.map((u) => u._id) } } },
      );
    }
  }
  targets.delete(String(me._id));
  // Work item "reporter" is the creator (manager). Stay silent until close.
  targets.delete(String(item.createdById));
  const mentionedIdSet = new Set(mentionedUsers.map((u) => String(u._id)));
  await Promise.all(
    Array.from(targets).map((uid) =>
      notify({
        userId: uid,
        title: mentionedIdSet.has(uid)
          ? `${me.username} mentioned you on "${item.title}"`
          : `New comment on "${item.title}"`,
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
  revalidatePath("/developer");
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
  revalidatePath("/developer");
  return { ok: true as const };
}

// ===========================================================================
// Delete a comment (chat) on a work item.
// Author can delete own comment; managers can delete any.
// ===========================================================================

export async function deleteWorkItemCommentAction(payload: unknown) {
  const me = await requireUser();
  const schema = z.object({
    id: z.string().min(1),
    activityId: z.string().min(1),
  });
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (
    !mongoose.Types.ObjectId.isValid(parsed.data.id) ||
    !mongoose.Types.ObjectId.isValid(parsed.data.activityId)
  ) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const item = await WorkItem.findById(parsed.data.id)
    .select("activity._id activity.byId activity.kind activity.deletedAt")
    .lean();
  if (!item) return { ok: false as const, error: "Not found." };
  const entry = (item.activity ?? []).find(
    (a: { _id?: unknown }) => String(a._id) === String(parsed.data.activityId),
  ) as { byId?: unknown; kind?: string; deletedAt?: Date | null } | undefined;
  if (!entry) return { ok: false as const, error: "Comment not found." };
  if (entry.kind !== "comment") return { ok: false as const, error: "Not deletable." };
  if (entry.deletedAt) return { ok: true as const };
  if (String(entry.byId) !== String(me._id)) {
    return { ok: false as const, error: "You can only delete your own comments." };
  }
  const activityObjectId = new mongoose.Types.ObjectId(parsed.data.activityId);
  await WorkItem.updateOne(
    { _id: parsed.data.id, "activity._id": activityObjectId },
    {
      $set: {
        "activity.$.deletedAt": new Date(),
        "activity.$.deletedById": me._id,
        "activity.$.deletedByName": me.username,
        "activity.$.deletedByHandle": me.userId,
        "activity.$.text": "",
      },
    },
  );
  await recordAudit({
    category: "delete",
    action: "workitem.comment.delete",
    targetType: "WorkItem",
    targetId: parsed.data.id,
    meta: { activityId: parsed.data.activityId, byManager: false },
  });
  revalidatePath("/developer");
  return { ok: true as const };
}

// ===========================================================================
// Tags
// ===========================================================================

export async function setWorkItemTagsAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1).max(24)).max(12),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const cleaned = Array.from(
    new Set(parsed.data.tags.map((t) => t.toLowerCase())),
  ).slice(0, 12);
  const before = await WorkItem.findById(parsed.data.id).select("tags").lean();
  if (!before) return { ok: false as const, error: "Not found." };
  const prev = (before.tags ?? []) as string[];
  if (
    prev.length === cleaned.length &&
    prev.every((t, i) => t === cleaned[i])
  ) {
    return { ok: true as const, tags: cleaned };
  }
  await WorkItem.updateOne(
    { _id: parsed.data.id },
    {
      $set: { tags: cleaned },
      $push: {
        activity: makeActivity(me, "tag_change", "", {
          from: prev,
          to: cleaned,
        }),
      },
    },
  );
  await recordAudit({
    action: "workitem.tags",
    category: "update",
    targetType: "WorkItem",
    targetId: parsed.data.id,
    meta: { tags: cleaned },
  });
  revalidatePath("/developer");
  return { ok: true as const, tags: cleaned };
}

// ===========================================================================
// Story points
// ===========================================================================

export async function setWorkItemPointsAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      points: z.number().int().min(0).max(100).nullable(),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const before = await WorkItem.findById(parsed.data.id).select("storyPoints").lean();
  if (!before) return { ok: false as const, error: "Not found." };
  if ((before.storyPoints ?? null) === parsed.data.points) {
    return { ok: true as const };
  }
  await WorkItem.updateOne(
    { _id: parsed.data.id },
    {
      $set: { storyPoints: parsed.data.points },
      $push: {
        activity: makeActivity(me, "points_change", "", {
          from: before.storyPoints ?? null,
          to: parsed.data.points,
        }),
      },
    },
  );
  revalidatePath("/developer");
  return { ok: true as const };
}

// ===========================================================================
// Due date
// ===========================================================================

export async function setWorkItemDueAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      dueAt: z.string().trim().nullable(),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  let nextDue: Date | null = null;
  if (parsed.data.dueAt) {
    const d = new Date(parsed.data.dueAt);
    if (Number.isNaN(d.getTime())) {
      return { ok: false as const, error: "Invalid date." };
    }
    nextDue = d;
  }
  const before = await WorkItem.findById(parsed.data.id).select("dueAt").lean();
  if (!before) return { ok: false as const, error: "Not found." };
  await WorkItem.updateOne(
    { _id: parsed.data.id },
    {
      $set: { dueAt: nextDue },
      $push: {
        activity: makeActivity(me, "due_change", "", {
          from: before.dueAt ? new Date(before.dueAt).toISOString() : null,
          to: nextDue ? nextDue.toISOString() : null,
        }),
      },
    },
  );
  revalidatePath("/developer");
  return { ok: true as const };
}

// ===========================================================================
// Subtasks
// ===========================================================================

export async function addWorkItemSubtaskAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      text: z.string().trim().min(1).max(280),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  const subtask = {
    _id: new mongoose.Types.ObjectId(),
    text: parsed.data.text,
    done: false,
    addedAt: new Date(),
    addedById: me._id,
    addedByName: me.username,
    doneAt: null,
    doneById: null,
    doneByName: null,
  };
  const res = await WorkItem.updateOne(
    { _id: parsed.data.id, deletedAt: null },
    {
      $push: {
        subtasks: subtask,
        activity: makeActivity(me, "subtask_change", parsed.data.text, {
          op: "add",
        }),
      },
    },
  );
  if (res.matchedCount === 0) return { ok: false as const, error: "Not found." };
  revalidatePath("/developer");
  return { ok: true as const, subtaskId: String(subtask._id) };
}

export async function toggleWorkItemSubtaskAction(payload: unknown) {
  const me = await requireUser();
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      subtaskId: z.string().trim().min(1),
      done: z.boolean(),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (
    !mongoose.Types.ObjectId.isValid(parsed.data.id) ||
    !mongoose.Types.ObjectId.isValid(parsed.data.subtaskId)
  ) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  // Only the assignee or a manager can toggle subtasks.
  const item = await WorkItem.findById(parsed.data.id)
    .select("assignedToId subtasks._id subtasks.text")
    .lean();
  if (!item) return { ok: false as const, error: "Not found." };
  const canManageRes = await assertFeature("dev.workitems.manage");
  const isAssignee = String(item.assignedToId) === String(me._id);
  if (!isAssignee && !canManageRes.ok) {
    return { ok: false as const, error: "Only the assignee can tick this." };
  }
  const subId = new mongoose.Types.ObjectId(parsed.data.subtaskId);
  const sub = (item.subtasks ?? []).find(
    (s: { _id?: unknown }) => String(s._id) === String(subId),
  ) as { text?: string } | undefined;
  await WorkItem.updateOne(
    { _id: parsed.data.id, "subtasks._id": subId },
    {
      $set: {
        "subtasks.$.done": parsed.data.done,
        "subtasks.$.doneAt": parsed.data.done ? new Date() : null,
        "subtasks.$.doneById": parsed.data.done ? me._id : null,
        "subtasks.$.doneByName": parsed.data.done ? me.username : null,
      },
      $push: {
        activity: makeActivity(me, "subtask_change", sub?.text ?? "", {
          op: parsed.data.done ? "check" : "uncheck",
        }),
      },
    },
  );
  revalidatePath("/developer");
  return { ok: true as const };
}

export async function removeWorkItemSubtaskAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      subtaskId: z.string().trim().min(1),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (
    !mongoose.Types.ObjectId.isValid(parsed.data.id) ||
    !mongoose.Types.ObjectId.isValid(parsed.data.subtaskId)
  ) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  await WorkItem.updateOne(
    { _id: parsed.data.id },
    {
      $pull: { subtasks: { _id: new mongoose.Types.ObjectId(parsed.data.subtaskId) } },
      $push: {
        activity: makeActivity(me, "subtask_change", "", { op: "remove" }),
      },
    },
  );
  revalidatePath("/developer");
  return { ok: true as const };
}

// ===========================================================================
// Attachments (image data-URLs, ~700KB cap)
// ===========================================================================

const ATTACHMENT_MAX_BYTES = 800_000; // ~600KB compressed image budget + slack
const ATTACHMENTS_MAX = 10;

export async function addWorkItemAttachmentAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1).max(200),
      dataUrl: z.string().min(20),
      mime: z.string().default("image/jpeg"),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  if (!/^data:image\//.test(parsed.data.dataUrl)) {
    return { ok: false as const, error: "Only image attachments are supported." };
  }
  if (parsed.data.dataUrl.length > ATTACHMENT_MAX_BYTES) {
    return { ok: false as const, error: "Attachment too large — compress further." };
  }
  await connectDB();
  const item = await WorkItem.findById(parsed.data.id).select("attachments._id").lean();
  if (!item) return { ok: false as const, error: "Not found." };
  if ((item.attachments?.length ?? 0) >= ATTACHMENTS_MAX) {
    return { ok: false as const, error: `Maximum ${ATTACHMENTS_MAX} attachments per item.` };
  }
  const attachment = {
    _id: new mongoose.Types.ObjectId(),
    name: parsed.data.name,
    dataUrl: parsed.data.dataUrl,
    mime: parsed.data.mime,
    bytes: parsed.data.dataUrl.length,
    addedAt: new Date(),
    addedById: me._id,
    addedByName: me.username,
  };
  await WorkItem.updateOne(
    { _id: parsed.data.id },
    {
      $push: {
        attachments: attachment,
        activity: makeActivity(me, "attachment_change", parsed.data.name, {
          op: "add",
        }),
      },
    },
  );
  revalidatePath("/developer");
  return { ok: true as const, attachmentId: String(attachment._id) };
}

export async function removeWorkItemAttachmentAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      attachmentId: z.string().trim().min(1),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (
    !mongoose.Types.ObjectId.isValid(parsed.data.id) ||
    !mongoose.Types.ObjectId.isValid(parsed.data.attachmentId)
  ) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  await WorkItem.updateOne(
    { _id: parsed.data.id },
    {
      $pull: {
        attachments: {
          _id: new mongoose.Types.ObjectId(parsed.data.attachmentId),
        },
      },
      $push: {
        activity: makeActivity(me, "attachment_change", "", { op: "remove" }),
      },
    },
  );
  revalidatePath("/developer");
  return { ok: true as const };
}

// ===========================================================================
// Reorder (drag within / between status columns on the board view)
// ===========================================================================

export async function reorderWorkItemAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      id: z.string().trim().min(1),
      status: z.enum(["open", "in_progress", "blocked", "done"]),
      /** Ordered list of work-item ids in the destination column AFTER the move. */
      siblings: z.array(z.string().trim().min(1)).max(500),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  if (!mongoose.Types.ObjectId.isValid(parsed.data.id)) {
    return { ok: false as const, error: "Invalid id." };
  }
  await connectDB();
  // Bulk write: update each sibling's order (1000-spaced for cheap inserts).
  type ReorderOp = {
    updateOne: {
      filter: { _id: mongoose.Types.ObjectId };
      update: { $set: Record<string, unknown> };
    };
  };
  const ops: ReorderOp[] = parsed.data.siblings.map((sid, idx) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(sid) },
      update: { $set: { order: (idx + 1) * 1000 } },
    },
  }));
  // Also force-set the moved item's status (in case it crossed columns).
  ops.push({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(parsed.data.id) },
      update: { $set: { status: parsed.data.status } },
    },
  });
  if (ops.length === 0) return { ok: true as const };
  await WorkItem.bulkWrite(ops);

  // If status changed, append an activity row.
  const moved = await WorkItem.findById(parsed.data.id).select("status").lean();
  if (moved && moved.status === parsed.data.status) {
    // Best-effort audit
    await recordAudit({
      action: "workitem.reorder",
      category: "update",
      targetType: "WorkItem",
      targetId: parsed.data.id,
      meta: { status: parsed.data.status, count: parsed.data.siblings.length },
    });
  }
  void me;
  revalidatePath("/developer");
  return { ok: true as const };
}

// ===========================================================================
// Bulk actions (multi-select)
// ===========================================================================

export async function bulkUpdateWorkItemsAction(payload: unknown) {
  const me = await requireAdminFeature("dev.workitems.manage");
  const parsed = z
    .object({
      ids: z.array(z.string().trim().min(1)).min(1).max(100),
      action: z.enum(["status", "priority", "assign", "delete"]),
      status: z.enum(["open", "in_progress", "blocked", "done"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      assignedToId: z.string().trim().optional(),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  for (const id of parsed.data.ids) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return { ok: false as const, error: "Invalid id in selection." };
    }
  }
  await connectDB();
  const ids = parsed.data.ids.map((s) => new mongoose.Types.ObjectId(s));

  if (parsed.data.action === "delete") {
    await WorkItem.updateMany(
      { _id: { $in: ids }, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: me._id } },
    );
    await recordAudit({
      action: "workitem.bulk.delete",
      category: "delete",
      targetType: "WorkItem",
      targetId: ids.map(String).join(","),
      meta: { count: ids.length },
    });
    revalidatePath("/developer");
    return { ok: true as const, count: ids.length };
  }

  if (parsed.data.action === "status") {
    if (!parsed.data.status) return { ok: false as const, error: "Pick a status." };
    const $set: Record<string, unknown> = {
      status: parsed.data.status,
      closedAt: parsed.data.status === "done" ? new Date() : null,
    };
    await WorkItem.updateMany({ _id: { $in: ids } }, { $set });
    await recordAudit({
      action: "workitem.bulk.status",
      category: "update",
      targetType: "WorkItem",
      targetId: ids.map(String).join(","),
      meta: { status: parsed.data.status, count: ids.length },
    });
    revalidatePath("/developer");
    return { ok: true as const, count: ids.length };
  }

  if (parsed.data.action === "priority") {
    if (!parsed.data.priority) return { ok: false as const, error: "Pick a priority." };
    await WorkItem.updateMany(
      { _id: { $in: ids } },
      { $set: { priority: parsed.data.priority } },
    );
    revalidatePath("/developer");
    return { ok: true as const, count: ids.length };
  }

  if (parsed.data.action === "assign") {
    if (!parsed.data.assignedToId || !mongoose.Types.ObjectId.isValid(parsed.data.assignedToId)) {
      return { ok: false as const, error: "Pick a valid assignee." };
    }
    const u = await User.findById(parsed.data.assignedToId)
      .select("username userId")
      .lean<{ _id: mongoose.Types.ObjectId; username: string; userId: string } | null>();
    if (!u) return { ok: false as const, error: "Assignee not found." };
    await WorkItem.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          assignedToId: u._id,
          assignedToName: u.username,
          assignedToHandle: u.userId,
          submission: null,
          needsReview: false,
        },
      },
    );
    await Promise.all(
      ids.map((wid) =>
        notifyWorkItemAssigned({ assigneeId: u._id, title: String(wid) }),
      ),
    );
    revalidatePath("/developer");
    return { ok: true as const, count: ids.length };
  }

  return { ok: false as const, error: "Unsupported action." };
}

// ===========================================================================
// Saved views (per-user UI preference)
// ===========================================================================

export async function saveWorkItemViewAction(payload: unknown) {
  const me = await requireUser();
  const parsed = z
    .object({
      view: z.enum(["list", "board", "table", "calendar", "mine"]).optional(),
      saveAs: z
        .object({
          name: z.string().trim().min(1).max(60),
          view: z.enum(["list", "board", "table", "calendar", "mine"]),
          filters: z.record(z.string(), z.any()).default({}),
        })
        .optional(),
      deleteId: z.string().trim().optional(),
    })
    .safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input." };
  await connectDB();

  if (parsed.data.view) {
    await User.updateOne(
      { _id: me._id },
      { $set: { "preferences.workItems.view": parsed.data.view } },
    );
  }
  if (parsed.data.saveAs) {
    const id = new mongoose.Types.ObjectId().toString();
    await User.updateOne(
      { _id: me._id },
      {
        $push: {
          "preferences.workItems.savedViews": {
            id,
            name: parsed.data.saveAs.name,
            view: parsed.data.saveAs.view,
            filters: parsed.data.saveAs.filters,
          },
        },
      },
    );
  }
  if (parsed.data.deleteId) {
    await User.updateOne(
      { _id: me._id },
      {
        $pull: {
          "preferences.workItems.savedViews": { id: parsed.data.deleteId },
        },
      },
    );
  }
  revalidatePath("/developer");
  return { ok: true as const };
}
