import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { connectDB } from "@/lib/db";
import { User, type IUser } from "@/models/User";
import { Role, type IRole } from "@/models/Role";
import type { FeatureKey } from "@/lib/features";

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

/** Load full user document for the current session, with custom-role features merged. */
export async function getCurrentUser(): Promise<IUser | null> {
  const s = await getSession();
  if (!s) return null;
  await connectDB();
  const u = await User.findById(s.uid).lean<IUser>();
  if (!u) return null;
  if (u.customRoleId) {
    const role = await Role.findById(u.customRoleId).lean<IRole>();
    if (role) {
      const merged = new Set<FeatureKey>([
        ...((u.enabledFeatures ?? []) as FeatureKey[]),
        ...((role.features ?? []) as FeatureKey[]),
      ]);
      u.enabledFeatures = Array.from(merged);
    }
  }
  return u;
}

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
