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

export async function requireAdminFeature(feature: FeatureKey) {
  const u = await requireRole("admin", "superadmin");
  if (u.role === "superadmin") return u;

  // Backward-compatible: existing admins with no explicit feature assignment
  // keep their current access. Once features are assigned, they are enforced.
  const enabled = u.enabledFeatures ?? [];
  if (enabled.length === 0 || enabled.includes(feature)) return u;
  redirect("/");
}

export async function isAdmin() {
  const s = await getSession();
  return s?.role === "admin" || s?.role === "superadmin";
}

/**
 * Non-redirecting visibility check used to gate UI sections by feature.
 * Mirrors `requireAdminFeature`: superadmins always pass; admins with no
 * explicit feature assignment keep legacy access; otherwise the feature
 * must be present in `enabledFeatures`.
 */
export function userHasFeature(
  user: { role: Role; enabledFeatures?: string[] | null } | null | undefined,
  feature: FeatureKey,
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.role !== "admin") return false;
  const enabled = user.enabledFeatures ?? [];
  if (enabled.length === 0) return true;
  return enabled.includes(feature);
}
