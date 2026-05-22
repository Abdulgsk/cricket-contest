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
 *  - superadmin (legacy full access)
 *  - any user with at least one feature flag granted directly OR via a custom role
 *  - any user with a `customRoleId` assigned (so they reach an Overview page
 *    explaining "no features yet" instead of being silently redirected away)
 */
export async function requireAdminAccess() {
  const u = await requireUser();
  if (u.role === "superadmin") return u;
  if ((u.enabledFeatures ?? []).length > 0) return u;
  if (u.customRoleId) return u;
  redirect("/");
}

export async function requireAdminFeature(feature: FeatureKey) {
  const u = await requireUser();
  if (userHasFeature(u, feature)) return u;
  redirect("/");
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
 */
export function userHasAdminAccess(
  user: {
    role: Role;
    enabledFeatures?: string[] | null;
    customRoleId?: unknown;
  } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if ((user.enabledFeatures ?? []).length > 0) return true;
  if (user.customRoleId) return true;
  return false;
}
