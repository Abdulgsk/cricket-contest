import { redirect } from "next/navigation";
import { getCurrentUser, getSession } from "@/lib/session";
import type { Role } from "@/lib/constants";
import type { FeatureKey } from "@/lib/features";
import {
  canAccessAdminRoute,
  getAdminRouteForPath,
  hasAnyAdminRouteAccess,
} from "@/lib/admin-route-access";

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
 * Allows access to the admin console for:
 *  - superadmin (legacy full access)
 *  - any user with at least one feature flag granted directly OR via a custom role
 *  - any user with a `customRoleId` assigned (so they reach an Overview page
 *    explaining "no features yet" instead of being silently redirected away)
 */
export async function requireAdminAccess() {
  const u = await requireUser();
  if (hasAnyAdminRouteAccess(u)) return u;
  redirect("/dashboard");
}

/**
 * Gate a server entry point on a specific feature.
 * If the user has *some* admin access we bounce them back to /admin (so the
 * page chrome stays visible); otherwise to /dashboard.
 */
export async function requireAdminFeature(feature: FeatureKey) {
  const u = await requireUser();
  if (userHasFeature(u, feature)) return u;
  redirect(hasAnyAdminRouteAccess(u) ? "/admin" : "/dashboard");
}

/**
 * Centralised gate used by the admin layout. Reads the current request path,
 * looks up the matching route registration, and enforces it. Returns the
 * authenticated user when access is allowed.
 */
export async function requireAdminRouteAccess(pathname: string) {
  const u = await requireAdminAccess();
  const route = getAdminRouteForPath(pathname);
  if (!route) return u; // route not registered -> overview-level access is enough
  if (!canAccessAdminRoute(u, route)) {
    // Send them somewhere they CAN see instead of looping.
    redirect(pathname === "/admin" ? "/dashboard" : "/admin");
  }
  return u;
}

export async function isAdmin() {
  const s = await getSession();
  return s?.role === "superadmin";
}

/**
 * Non-redirecting visibility check used to gate UI sections by feature.
 *  - superadmin: always true
 *  - everyone else: must have the feature listed in their (already-merged)
 *    `enabledFeatures`. The legacy "admin" system role no longer implies
 *    anything on its own — features must be explicit.
 */
export function userHasFeature(
  user: { role: Role; enabledFeatures?: string[] | null } | null | undefined,
  feature: FeatureKey,
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  const enabled = user.enabledFeatures ?? [];
  return enabled.includes(feature);
}

/**
 * Non-redirecting check for whether the user can see the Admin tab at all.
 * Thin wrapper around `hasAnyAdminRouteAccess` for backwards compatibility.
 */
export function userHasAdminAccess(
  user: {
    role: Role;
    enabledFeatures?: string[] | null;
    customRoleId?: unknown;
  } | null | undefined,
): boolean {
  if (!user) return false;
  return hasAnyAdminRouteAccess(user);
}
