"use server";

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { Notification } from "@/models/Notification";
import { requireUser } from "@/lib/rbac";

/** Lists the latest notifications relevant to the current user.
 *  Returns both user-targeted ones and broadcasts (userId = null), newest first.
 */
export async function listMyNotificationsAction(limit = 30) {
  const me = await requireUser();
  await connectDB();
  const docs = await (Notification.find as unknown as (q: unknown) => ReturnType<typeof Notification.find>)({
    $or: [{ userId: me._id }, { userId: null }, { userId: { $exists: false } }],
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .lean();
  const meId = String(me._id);
  return docs.map((d) => {
    const isBroadcast = !d.userId;
    const read = isBroadcast
      ? (d.readBy ?? []).some((u) => String(u) === meId)
      : !!d.read;
    return {
      id: String(d._id),
      kind: d.kind ?? "system",
      title: d.title,
      body: d.body,
      link: d.link ?? null,
      read,
      createdAt: new Date(d.createdAt).toISOString(),
    };
  });
}

export async function markAllNotificationsReadAction() {
  const me = await requireUser();
  await connectDB();
  await Notification.updateMany(
    { userId: me._id, read: false },
    { $set: { read: true } },
  );
  // Broadcasts: append my id to readBy so the bell hides them too.
  await (Notification.updateMany as unknown as (q: unknown, u: unknown) => Promise<unknown>)(
    {
      userId: null,
      readBy: { $ne: me._id },
    },
    { $addToSet: { readBy: me._id } },
  );
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function markOneNotificationReadAction(id: string) {
  const me = await requireUser();
  if (!id) return { ok: false as const };
  await connectDB();
  const doc = await Notification.findById(id).select("userId").lean();
  if (!doc) return { ok: false as const };
  if (doc.userId && String(doc.userId) === String(me._id)) {
    await Notification.updateOne({ _id: id }, { $set: { read: true } });
  } else if (!doc.userId) {
    await Notification.updateOne(
      { _id: id, readBy: { $ne: me._id } },
      { $addToSet: { readBy: me._id } },
    );
  }
  return { ok: true as const };
}
