"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { setSessionCookie, clearSessionCookie, getCurrentUser } from "@/lib/session";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const SignupSchema = z.object({
  userId: z.string().min(2).max(40),
  username: z.string().min(2).max(60),
  password: z.string().min(4).max(100),
  whatsapp: z.string().optional().or(z.literal("")),
});

const LoginSchema = z.object({
  userId: z.string().min(2),
  password: z.string().min(1),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Normalize phone input to E.164 (+91XXXXXXXXXX). User enters digits only;
 * we strip non-digits, drop leading 0/91, and prefix +91. Blank stays blank. */
function normalizeWhatsapp(raw: string): string | undefined {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return undefined;
  let d = digits;
  if (d.startsWith("91") && d.length > 10) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length !== 10) return undefined;
  return `+91${d}`;
}

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const parsed = SignupSchema.safeParse({
    userId: formData.get("userId"),
    username: formData.get("username"),
    password: formData.get("password"),
    whatsapp: formData.get("whatsapp") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  await connectDB();
  const userId = parsed.data.userId.toLowerCase().trim();
  const exists = await User.findOne({ userId });
  if (exists) return { ok: false, error: "User ID already taken" };

  const role = userId === env.SUPER_ADMIN_USER_ID ? "superadmin" : "user";
  const wa = normalizeWhatsapp(parsed.data.whatsapp || "");
  if (parsed.data.whatsapp && !wa) {
    return { ok: false, error: "Enter a valid 10-digit Indian mobile number" };
  }
  const created = await User.create({
    userId,
    username: parsed.data.username.trim(),
    password: parsed.data.password, // PLAIN TEXT per spec
    whatsapp: wa,
    role,
  });

  await setSessionCookie({ uid: String(created._id), userId: created.userId, role: created.role });
  await recordAudit({
    category: "auth",
    action: "auth.signup",
    actor: created,
    targetType: "User",
    targetId: String(created._id),
    meta: { role: created.role },
  });
  redirect("/dashboard");
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await connectDB();
  const u = await User.findOne({ userId: parsed.data.userId.toLowerCase().trim() });
  if (!u || u.password !== parsed.data.password) {
    await recordAudit({
      category: "auth",
      action: "auth.login.failed",
      actorHandle: parsed.data.userId.toLowerCase().trim(),
      meta: { reason: "invalid_credentials" },
    });
    return { ok: false, error: "Invalid credentials" };
  }
  await setSessionCookie({ uid: String(u._id), userId: u.userId, role: u.role });
  await recordAudit({
    category: "auth",
    action: "auth.login",
    actor: u,
  });
  redirect("/dashboard");
}

export async function logoutAction() {
  const me = await getCurrentUser();
  await clearSessionCookie();
  if (me) {
    await recordAudit({ category: "auth", action: "auth.logout", actor: me });
  }
  redirect("/login");
}

const PasswordChangeSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(4),
});

export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not authenticated" };
  const parsed = PasswordChangeSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await connectDB();
  const u = await User.findById(me._id);
  if (!u || u.password !== parsed.data.current) return { ok: false, error: "Current password incorrect" };
  u.password = parsed.data.next;
  await u.save();
  await recordAudit({
    category: "update",
    action: "auth.password.change",
    actor: me,
    targetType: "User",
    targetId: String(me._id),
  });
  return { ok: true };
}

const ProfileSchema = z.object({
  username: z.string().min(2).max(60),
  whatsapp: z.string().optional().or(z.literal("")),
  bio: z.string().max(280).optional().or(z.literal("")),
});

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not authenticated" };
  const parsed = ProfileSchema.safeParse({
    username: formData.get("username"),
    whatsapp: formData.get("whatsapp") ?? "",
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await connectDB();
  const wa = normalizeWhatsapp(parsed.data.whatsapp || "");
  if (parsed.data.whatsapp && !wa) {
    return { ok: false, error: "Enter a valid 10-digit Indian mobile number" };
  }
  await User.updateOne(
    { _id: me._id },
    {
      username: parsed.data.username.trim(),
      whatsapp: wa,
      bio: parsed.data.bio?.trim() || null,
    }
  );
  await recordAudit({
    category: "update",
    action: "user.profile.update",
    actor: me,
    targetType: "User",
    targetId: String(me._id),
    meta: { username: parsed.data.username.trim(), hasWhatsapp: Boolean(wa) },
  });
  revalidatePath("/profile");
  revalidatePath(`/players/${String(me._id)}`);
  return { ok: true };
}

/**
 * Maximum stored avatar size (raw data URI string length). With JPEG quality
 * 0.82 at 512x512 this typically lands at 60–90 KB. We cap at 192 KB to leave
 * headroom while keeping User documents reasonable.
 */
const MAX_AVATAR_BYTES = 192 * 1024;
const AVATAR_DATA_URI_RE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/;

export async function updateAvatarAction(
  dataUri: string | null
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not authenticated" };
  await connectDB();

  if (dataUri === null || dataUri === "") {
    await User.updateOne({ _id: me._id }, { $set: { avatar: null } });
    revalidatePath("/profile");
    revalidatePath("/leaderboard");
    return { ok: true };
  }

  if (typeof dataUri !== "string" || !AVATAR_DATA_URI_RE.test(dataUri)) {
    return { ok: false, error: "Invalid image" };
  }
  if (dataUri.length > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Image too large (max ~70 KB after compression)" };
  }

  await User.updateOne({ _id: me._id }, { $set: { avatar: dataUri } });
  revalidatePath("/profile");
  revalidatePath("/leaderboard");
  revalidatePath(`/players/${String(me._id)}`);
  return { ok: true };
}
