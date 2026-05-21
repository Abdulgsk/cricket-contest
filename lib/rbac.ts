import { redirect } from "next/navigation";
import { getCurrentUser, getSession } from "@/lib/session";
import type { Role } from "@/lib/constants";
import type { FeatureKey } from "@/lib/features";

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireRole(...roles: Role[]) {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect("/");
  return u;
}

/**
 * Allows access to the admin console for:
 *  - superadmin / admin (legacy full access)
 *  - any plain user that has at least one feature flag granted to them
 *    (so they can use the specific tools that were enabled for them).
 */
export async function requireAdminAccess() {
  const u = await requireUser();
  if (u.role === "admin" || u.role === "superadmin") return u;
  if ((u.enabledFeatures ?? []).length > 0) return u;
  redirect("/");
}

export async function requireAdminFeature(feature: FeatureKey) {
  const u = await requireUser();
  if (userHasFeature(u, feature)) return u;
  redirect("/");
}

export async function isAdmin() {
  const s = await getSession();
  return s?.role === "admin" || s?.role === "superadmin";
}

/**
 * Non-redirecting visibility check used to gate UI sections by feature.
 *  - superadmin: always true
 *  - admin with no explicit assignments: legacy full access (true)
 *  - admin or plain user with explicit assignments: must include the feature
 */
export function userHasFeature(
  user: { role: Role; enabledFeatures?: string[] | null } | null | undefined,
  feature: FeatureKey,
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  const enabled = user.enabledFeatures ?? [];
  if (user.role === "admin" && enabled.length === 0) return true;
  return enabled.includes(feature);
}

/**
 * Non-redirecting check for whether the user can see the Admin tab at all.
 */
export function userHasAdminAccess(
  user: { role: Role; enabledFeatures?: string[] | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "superadmin") return true;
  return (user.enabledFeatures ?? []).length > 0;
}
