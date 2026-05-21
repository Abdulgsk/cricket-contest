"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { UserMatchTeam } from "@/models/UserMatchTeam";
import { requireUser, requireAdminFeature } from "@/lib/rbac";
import { verifyMy11NameAgainstRecentMatches } from "@/services/my11-name-verify";
import { normalizeMy11circleName } from "@/lib/my11circle";
import { recordAudit } from "@/lib/audit";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const GRACE_MS = 6 * 60 * 60 * 1000;

const NameSchema = z.string().trim().min(1).max(80);

/** Whether the user can run verify+save right now without a fresh approval. */
function isInGrace(graceUntil: Date | null | undefined): boolean {
  return !!graceUntil && new Date(graceUntil).getTime() > Date.now();
}

/**
 * USER: submit a request to change my11circleName. If the user is already in
 * the 6-hour grace window OR already has a live approval, this short-circuits
 * to "approved" so the UI can move straight to verify+save.
 */
export async function requestMy11NameChangeAction(
  newName: string
): Promise<ActionResult<{ status: "pending" | "approved"; requested: string }>> {
  const me = await requireUser();
  const parsed = NameSchema.safeParse(newName);
  if (!parsed.success) return { ok: false, error: "Enter a valid name" };
  await connectDB();
  const u = await User.findById(me._id);
  if (!u) return { ok: false, error: "User not found" };

  // Same as current saved name → nothing to do.
  if (
    u.my11circleName &&
    normalizeMy11circleName(u.my11circleName) === normalizeMy11circleName(parsed.data)
  ) {
    return { ok: false, error: "That's already your saved My11Circle name" };
  }

  // Grace window or live approval → no admin needed.
  if (isInGrace(u.my11NameChangeGraceUntil)) {
    return { ok: true, status: "approved", requested: parsed.data };
  }
  if (u.my11NameRequest?.status === "approved") {
    return {
      ok: true,
      status: "approved",
      requested: u.my11NameRequest.requested,
    };
  }

  u.my11NameRequest = {
    requested: parsed.data,
    requestedAt: new Date(),
    status: "pending",
    decidedAt: null,
    deniedReason: null,
  };
  await u.save();
  await recordAudit({
    category: "create",
    action: "my11.name.request",
    actor: me,
    targetType: "User",
    targetId: String(me._id),
    meta: { requested: parsed.data },
  });
  revalidatePath("/profile");
  revalidatePath("/admin");
  return { ok: true, status: "pending", requested: parsed.data };
}

/** USER: cancel a pending request. */
export async function cancelMy11NameRequestAction(): Promise<ActionResult> {
  const me = await requireUser();
  await connectDB();
  const u = await User.findById(me._id);
  if (!u) return { ok: false, error: "User not found" };
  if (u.my11NameRequest?.status !== "pending") {
    return { ok: false, error: "No pending request" };
  }
  u.my11NameRequest = null;
  await u.save();
  revalidatePath("/profile");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * USER: run the leaderboard verification check for the candidate name. Only
 * permitted when the user is in the 6-hour grace window OR has an approved
 * request waiting.
 */
export async function verifyMy11NameAction(newName: string): Promise<
  ActionResult<{
    matched: boolean;
    sample?: { teamA: string; teamB: string; score: number; rank: number | null };
    reason?: string;
  }>
> {
  const me = await requireUser();
  const parsed = NameSchema.safeParse(newName);
  if (!parsed.success) return { ok: false, error: "Enter a valid name" };
  await connectDB();
  const u = await User.findById(me._id);
  if (!u) return { ok: false, error: "User not found" };
  const allowed =
    isInGrace(u.my11NameChangeGraceUntil) ||
    u.my11NameRequest?.status === "approved";
  if (!allowed) {
    return { ok: false, error: "Not authorised to verify yet" };
  }

  const res = await verifyMy11NameAgainstRecentMatches(parsed.data);
  if (!res.ok) {
    return { ok: false, error: friendlyVerifyReason(res.reason) };
  }
  if (res.matched) {
    return {
      ok: true,
      matched: true,
      sample: res.sample,
    };
  }
  return { ok: true, matched: false };
}

function friendlyVerifyReason(reason: string): string {
  switch (reason) {
    case "no_recent_match":
      return "No recent contest leaderboard available — try again later.";
    case "auth_expired":
      return "My11Circle session expired — admin must refresh, then retry.";
    case "my11_not_ready":
      return "My11Circle not ready yet — try again in a moment.";
    default:
      return "Verification unavailable. Try again later.";
  }
}

/**
 * USER: save the new my11 name. Re-runs the verification server-side (so the
 * client can't bypass it), then updates the field, opens a fresh 6-hour
 * grace window, and clears any approval.
 */
export async function saveMy11NameAction(
  newName: string
): Promise<ActionResult<{ graceUntil: string }>> {
  const me = await requireUser();
  const parsed = NameSchema.safeParse(newName);
  if (!parsed.success) return { ok: false, error: "Enter a valid name" };
  await connectDB();
  const u = await User.findById(me._id);
  if (!u) return { ok: false, error: "User not found" };
  const allowed =
    isInGrace(u.my11NameChangeGraceUntil) ||
    u.my11NameRequest?.status === "approved";
  if (!allowed) {
    return { ok: false, error: "Not authorised to save yet" };
  }

  // Server-side re-verification — the client check alone is not trusted.
  const res = await verifyMy11NameAgainstRecentMatches(parsed.data);
  if (!res.ok) return { ok: false, error: friendlyVerifyReason(res.reason) };
  if (!res.matched) {
    return {
      ok: false,
      error:
        "Could not verify this name in any recent leaderboard — double-check your My11Circle username.",
    };
  }

  const graceUntil = new Date(Date.now() + GRACE_MS);
  const cleanName = parsed.data.trim();
  u.my11circleName = cleanName;
  u.my11NameChangeGraceUntil = graceUntil;
  u.my11NameRequest = null;
  await u.save();

  // Keep all denormalised copies of the my11 username in sync so display
  // strings and joins stay consistent across the app. Actual mapping logic
  // already keys on `userId`, so this is purely a label refresh.
  await UserMatchTeam.updateMany(
    { userId: u._id },
    { $set: { my11Username: cleanName } }
  );

  await recordAudit({
    category: "update",
    action: "my11.name.save",
    actor: me,
    targetType: "User",
    targetId: String(me._id),
    meta: { newName: cleanName },
  });
  revalidatePath("/profile");
  revalidatePath("/admin");
  revalidatePath("/contests");
  revalidatePath(`/players/${String(me._id)}`);
  return { ok: true, graceUntil: graceUntil.toISOString() };
}

// ---- Admin actions -------------------------------------------------------

/** ADMIN: approve a pending request. */
export async function adminApproveMy11NameAction(
  userId: string
): Promise<ActionResult> {
  const admin = await requireAdminFeature("users.manage");
  await connectDB();
  const u = await User.findById(userId);
  if (!u) return { ok: false, error: "User not found" };
  if (u.my11NameRequest?.status !== "pending") {
    return { ok: false, error: "No pending request" };
  }
  u.my11NameRequest = {
    ...u.my11NameRequest,
    status: "approved",
    decidedAt: new Date(),
    deniedReason: null,
  };
  await u.save();
  await recordAudit({
    category: "update",
    action: "my11.name.approve",
    actor: admin,
    targetType: "User",
    targetId: String(userId),
    meta: { requested: u.my11NameRequest.requested },
  });
  revalidatePath("/admin");
  revalidatePath("/profile");
  return { ok: true };
}

/** ADMIN: deny a pending request. */
export async function adminDenyMy11NameAction(
  userId: string,
  reason?: string
): Promise<ActionResult> {
  const admin = await requireAdminFeature("users.manage");
  await connectDB();
  const u = await User.findById(userId);
  if (!u) return { ok: false, error: "User not found" };
  if (u.my11NameRequest?.status !== "pending") {
    return { ok: false, error: "No pending request" };
  }
  u.my11NameRequest = {
    ...u.my11NameRequest,
    status: "denied",
    decidedAt: new Date(),
    deniedReason: reason?.trim() || null,
  };
  await u.save();
  await recordAudit({
    category: "update",
    action: "my11.name.deny",
    actor: admin,
    targetType: "User",
    targetId: String(userId),
    meta: { reason: reason?.trim() || null },
  });
  revalidatePath("/admin");
  revalidatePath("/profile");
  return { ok: true };
}
