import { redirect } from "next/navigation";
import { getCurrentUser, getSession } from "@/lib/session";
import type { Role } from "@/lib/constants";
import { bitmapHas, type FeatureKey } from "@/lib/features";
import {
  canAccessAdminRoute,
  getAdminRouteForPath,
  hasAnyAdminRouteAccess,
} from "@/lib/admin-route-access";

// ---------------------------------------------------------------------------
// Core principles
// ---------------------------------------------------------------------------
//  - Authentication failures redirect to /login (unauthenticated user).
//  - Authorisation failures NEVER redirect from server actions / API routes —
//    they return `{ ok: false, error }` so the calling component can render
//    a toast or "no access" UI without losing state.
//  - Pages may still redirect, but the preferred pattern is to render a
//    <NoAccessCard /> inline.
// ---------------------------------------------------------------------------

type RbacUser = {
  role: Role;
  enabledFeatures?: string[] | null;
  permissionBitmap?: string | null;
  customRoleId?: unknown;
};

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireRole(...roles: Role[]) {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect("/dashboard");
  return u;
}

/**
 * For pages: ensure user can see the admin shell. Redirects to /dashboard if
 * not. Sub-pages should NOT redirect on missing per-feature access — they
 * should render a NoAccessCard instead.
 */
export async function requireAdminAccess() {
  const u = await requireUser();
  if (hasAnyAdminRouteAccess(u)) return u;
  redirect("/dashboard");
}

export async function isAdmin() {
  const s = await getSession();
  return s?.role === "superadmin";
}

// ---------------------------------------------------------------------------
// Permission checks — sync, non-redirecting
// ---------------------------------------------------------------------------

/** True if the user has the given feature. Superadmin always passes. */
export function userCan(user: RbacUser | null | undefined, feature: FeatureKey): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  // Prefer bitmap; fall back to legacy array.
  if (user.permissionBitmap) return bitmapHas(user.permissionBitmap, feature);
  return (user.enabledFeatures ?? []).includes(feature);
}

/** True if the user has ANY of the given features. */
export function userCanAny(
  user: RbacUser | null | undefined,
  features: readonly FeatureKey[],
): boolean {
  if (features.length === 0) return true;
  return features.some((f) => userCan(user, f));
}

/** True if the user has ALL the given features. */
export function userCanAll(
  user: RbacUser | null | undefined,
  features: readonly FeatureKey[],
): boolean {
  return features.every((f) => userCan(user, f));
}

// Back-compat aliases (older code).
export const userHasFeature = userCan;
export function userHasAdminAccess(user: RbacUser | null | undefined): boolean {
  if (!user) return false;
  return hasAnyAdminRouteAccess(user);
}

// ---------------------------------------------------------------------------
// Soft auth for server actions / API routes
// ---------------------------------------------------------------------------

export type SoftAuthResult<TUser = Awaited<ReturnType<typeof requireUser>>> =
  | { ok: true; user: TUser }
  | { ok: false; error: string; status?: 401 | 403 };

/** Server action: returns `{ ok:false, error }` on auth/permission failure. */
export async function assertFeature(feature: FeatureKey): Promise<SoftAuthResult> {
  const u = await requireUser(); // only redirects when unauthenticated
  if (!userCan(u, feature)) {
    return { ok: false as const, error: "You don't have permission for this action", status: 403 };
  }
  return { ok: true as const, user: u };
}

export async function assertAnyFeature(
  features: readonly FeatureKey[],
): Promise<SoftAuthResult> {
  const u = await requireUser();
  if (!userCanAny(u, features)) {
    return { ok: false as const, error: "You don't have permission for this action", status: 403 };
  }
  return { ok: true as const, user: u };
}

export async function assertSuperadmin(): Promise<SoftAuthResult> {
  const u = await requireUser();
  if (u.role !== "superadmin") {
    return { ok: false as const, error: "Superadmin only", status: 403 };
  }
  return { ok: true as const, user: u };
}

/**
 * API route variant: takes a session payload (so the caller controls when
 * `getSession()` runs) and returns a typed result with HTTP status hints.
 */
export async function apiAssertFeature(
  session: { uid: string; role: Role } | null,
  feature: FeatureKey,
): Promise<{ ok: true } | { ok: false; status: 401 | 403; error: string }> {
  if (!session) return { ok: false, status: 401, error: "Unauthorized" };
  if (session.role === "superadmin") return { ok: true };
  const { User } = await import("@/models/User");
  const { Role } = await import("@/models/Role");
  const { connectDB } = await import("@/lib/db");
  const { bitmapOr, keysToBitmap } = await import("@/lib/features");
  await connectDB();
  const u = await User.findById(session.uid)
    .select("permissionBitmap enabledFeatures customRoleId")
    .lean<{
      permissionBitmap?: string;
      enabledFeatures?: string[];
      customRoleId?: unknown;
    }>();
  if (!u) return { ok: false, status: 401, error: "Unauthorized" };
  let mask = u.permissionBitmap ?? "0";
  if (mask === "0" && (u.enabledFeatures ?? []).length > 0) {
    mask = keysToBitmap(u.enabledFeatures as FeatureKey[]);
  }
  if (u.customRoleId) {
    const r = await Role.findById(u.customRoleId as string)
      .select("permissionBitmap features")
      .lean<{ permissionBitmap?: string; features?: string[] }>();
    if (r) {
      const roleMask =
        r.permissionBitmap && r.permissionBitmap !== "0"
          ? r.permissionBitmap
          : keysToBitmap((r.features ?? []) as FeatureKey[]);
      mask = bitmapOr(mask, roleMask);
    }
  }
  if (!bitmapHas(mask, feature)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Legacy redirect-on-failure variants. **Avoid in new code**.
// Kept for entry points that genuinely cannot recover gracefully.
// ---------------------------------------------------------------------------

/** @deprecated Prefer `assertFeature` (which returns instead of redirecting). */
export async function requireAdminFeature(feature: FeatureKey) {
  const u = await requireUser();
  if (userCan(u, feature)) return u;
  redirect(hasAnyAdminRouteAccess(u) ? "/admin" : "/dashboard");
}

/** Used by the admin layout to enforce route-level access. */
export async function requireAdminRouteAccess(pathname: string) {
  const u = await requireAdminAccess();
  const route = getAdminRouteForPath(pathname);
  if (!route) return u;
  if (!canAccessAdminRoute(u, route)) {
    redirect(pathname === "/admin" ? "/dashboard" : "/admin");
  }
  return u;
}
