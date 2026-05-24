// Single source of truth for admin route access + tab navigation.
//
// Everything that determines "who can see what" under /admin lives here:
//  - the nav tabs rendered by app/(app)/admin/layout.tsx
//  - the redirect gate enforced by the same layout on every sub-page
//  - the visibility check used by components/nav.tsx via lib/rbac::userHasAdminAccess
//
// Rules:
//  - superadmin bypasses everything.
//  - if `superadminOnly` is true, only superadmin can access the route.
//  - otherwise the user needs AT LEAST ONE feature listed in `anyOf`.
//  - the overview ("/admin") has `anyOf: []` and is accessible to anyone who
//    passes `requireAdminAccess` (i.e. has any granted feature OR a custom
//    role assigned) so they land on a personalised "Your tools" view.

import type { FeatureKey } from "@/lib/features";
import { bitmapHas } from "@/lib/features";

export type AdminRoute = {
  /** Route prefix. The longest matching prefix wins for nested routes. */
  path: string;
  /** Label shown in the admin nav. Set to null to hide from nav (still gated). */
  label: string | null;
  /** User needs at least one of these features. Empty = no feature gate. */
  anyOf: FeatureKey[];
  /** If true, only the superadmin system role can access. */
  superadminOnly?: boolean;
};

export const ADMIN_ROUTES: readonly AdminRoute[] = [
  { path: "/admin", label: "Overview", anyOf: [] },
  {
    path: "/admin/matches",
    label: "Matches",
    anyOf: ["matches.manage", "results.manage", "match.lock.extend"],
  },
  {
    path: "/admin/users",
    label: "Users",
    anyOf: ["users.manage", "users.roles.assign", "users.delete"],
  },
  {
    path: "/admin/permissions",
    label: "Permissions",
    anyOf: ["users.roles.assign"],
  },
  {
    path: "/admin/settings",
    label: "Settings",
    anyOf: [],
    superadminOnly: true,
  },
] as const;

type RbacUser = {
  role: "user" | "admin" | "superadmin";
  enabledFeatures?: string[] | null;
  permissionBitmap?: string | null;
  customRoleId?: unknown;
};

function userHas(user: RbacUser, feature: FeatureKey): boolean {
  if (user.permissionBitmap && user.permissionBitmap !== "0") {
    return bitmapHas(user.permissionBitmap, feature);
  }
  return (user.enabledFeatures ?? []).includes(feature);
}

function hasAny(user: RbacUser, features: readonly FeatureKey[]): boolean {
  if (features.length === 0) return true;
  return features.some((f) => userHas(user, f));
}

/** Does the user pass the gate on this specific admin route? */
export function canAccessAdminRoute(user: RbacUser, route: AdminRoute): boolean {
  if (user.role === "superadmin") return true;
  if (route.superadminOnly) return false;
  // Overview is always reachable for anyone with any admin access.
  if (route.path === "/admin") {
    return (
      (user.enabledFeatures ?? []).length > 0 || Boolean(user.customRoleId)
    );
  }
  return hasAny(user, route.anyOf);
}

/**
 * Find the route registration that owns the given pathname.
 * Picks the longest matching prefix so nested routes (e.g. /admin/matches/[id]/result)
 * inherit access from their parent (/admin/matches).
 */
export function getAdminRouteForPath(pathname: string): AdminRoute | null {
  let best: AdminRoute | null = null;
  for (const r of ADMIN_ROUTES) {
    const matches = pathname === r.path || pathname.startsWith(r.path + "/");
    if (!matches) continue;
    if (!best || r.path.length > best.path.length) best = r;
  }
  return best;
}

/** Routes the user should see in the admin nav, in declaration order. */
export function getAccessibleAdminRoutes(user: RbacUser): AdminRoute[] {
  return ADMIN_ROUTES.filter(
    (r) => r.label !== null && canAccessAdminRoute(user, r),
  );
}

/**
 * Features that belong to the standalone Developer Tools area, NOT to the
 * Admin Console. Granting only these features should not make the user
 * appear as an admin in the top nav or in `requireAdminAccess`.
 */
export const DEVELOPER_FEATURES: readonly FeatureKey[] = [
  "dev.member",
  "bugs.view", // retired but kept so legacy grants still classify as developer
  "dev.bug.manage",
  "audit.view",
  "dev.workitems.view", // retired but kept so legacy grants still classify as developer
  "dev.workitems.manage",
  "dev.diagnostics.view",
] as const;

/**
 * Returns true if the user has access to ANY admin functionality. Used by the
 * top-level nav to decide whether the "Admin" link is visible.
 */
export function hasAnyAdminRouteAccess(user: RbacUser): boolean {
  if (user.role === "superadmin") return true;
  // Any "admin" feature = anything in ADMIN_ROUTES.anyOf that the user holds.
  for (const route of ADMIN_ROUTES) {
    if (route.superadminOnly) continue;
    if (route.anyOf.length === 0) continue;
    if (hasAny(user, route.anyOf)) return true;
  }
  if (user.customRoleId) return true;
  return false;
}

/** True if the user can see the standalone Developer Tools page. */
export function hasDeveloperToolsAccess(user: RbacUser): boolean {
  if (user.role === "superadmin") return true;
  return DEVELOPER_FEATURES.some((f) => userHas(user, f));
}

// ---- Back-compat shims (kept so older imports keep compiling) -----------

/** @deprecated Use `getAdminRouteForPath` + `route.anyOf`. */
export function getRequiredFeaturesForAdminRoute(
  pathname: string,
): FeatureKey[] | null {
  const route = getAdminRouteForPath(pathname);
  if (!route || route.path === "/admin") return null;
  if (route.superadminOnly) return null;
  return route.anyOf.length > 0 ? [...route.anyOf] : null;
}

/** @deprecated Use `getAdminRouteForPath` + `route.superadminOnly`. */
export function adminRouteRequiresSuperadmin(pathname: string): boolean {
  const route = getAdminRouteForPath(pathname);
  return Boolean(route?.superadminOnly);
}
