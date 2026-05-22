import jwt from "jsonwebtoken";
import { cache } from "react";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { connectDB } from "@/lib/db";
import { User, type IUser } from "@/models/User";
import { Role, type IRole } from "@/models/Role";
import {
  bitmapOr,
  bitmapToKeys,
  keysToBitmap,
  type FeatureKey,
} from "@/lib/features";

export const SESSION_COOKIE = "ipl_session";
const SESSION_TTL_DAYS = 30;

export interface SessionPayload {
  uid: string; // mongo _id
  userId: string; // login handle
  role: "user" | "admin" | "superadmin";
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.AUTH_SECRET, { expiresIn: `${SESSION_TTL_DAYS}d` });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, env.AUTH_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

/** Read current session from cookies (server-only). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const tok = store.get(SESSION_COOKIE)?.value;
  if (!tok) return null;
  return verifySessionToken(tok);
}

/**
 * Load the current user with permissions resolved.
 *
 * Effective permissions = user.permissionBitmap | role.permissionBitmap.
 * For back-compat with rows that still only have `enabledFeatures` /
 * `Role.features` arrays, we OR those in too — so a slow migration is safe.
 *
 * `enabledFeatures` on the returned object is the **merged, materialised**
 * list of feature keys (handy for UI rendering); the source-of-truth bitmap
 * lives in `permissionBitmap`.
 */
export async function getCurrentUser(): Promise<IUser | null> {
  return _getCurrentUserCached();
}

// Per-request memoized variant. React.cache dedupes calls within a single
// server render, so `requireUser()` / `requireAdminAccess()` / layouts that
// each call `getCurrentUser()` only hit Mongo once.
const _getCurrentUserCached = cache(async (): Promise<IUser | null> => {
  const s = await getSession();
  if (!s) return null;
  await connectDB();
  const u = await User.findById(s.uid).lean<IUser>();
  if (!u) return null;

  // Start from the user's own bitmap (preferred) or legacy array fallback.
  let mask = u.permissionBitmap && u.permissionBitmap !== "0"
    ? u.permissionBitmap
    : keysToBitmap((u.enabledFeatures ?? []) as FeatureKey[]);

  if (u.customRoleId) {
    const role = await Role.findById(u.customRoleId).lean<IRole>();
    if (role) {
      const roleMask = role.permissionBitmap && role.permissionBitmap !== "0"
        ? role.permissionBitmap
        : keysToBitmap((role.features ?? []) as FeatureKey[]);
      mask = bitmapOr(mask, roleMask);
    }
  }

  u.permissionBitmap = mask;
  u.enabledFeatures = bitmapToKeys(mask);
  return u;
});

export async function setSessionCookie(payload: SessionPayload) {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
