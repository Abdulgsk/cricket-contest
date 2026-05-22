// Single source of truth for which features grant access to which admin route.
// Used by app/(app)/admin/layout.tsx — every admin sub-page goes through that
// layout, so adding a route here automatically gates it.
//
// Rules:
//  - superadmin bypasses everything
//  - if a route is listed below, the user must have ANY ONE of its features
//  - if a route is NOT listed, `requireAdminAccess()` alone is enough
//  - the "/admin" overview itself is never gated here (it shows whatever the
//    user is allowed to see)

import type { FeatureKey } from "@/lib/features";

type Rule = {
  // Match if pathname === prefix OR starts with prefix + "/"
  prefix: string;
  // User needs at least one of these features
  anyOf: FeatureKey[];
};

const RULES: Rule[] = [
  {
    prefix: "/admin/matches",
    anyOf: ["matches.manage", "results.manage", "match.lock.extend"],
  },
  {
    prefix: "/admin/users",
    anyOf: ["users.manage", "users.roles.assign", "users.delete"],
  },
  {
    prefix: "/admin/audit-logs",
    anyOf: ["audit.view"],
  },
];

export function getRequiredFeaturesForAdminRoute(
  pathname: string
): FeatureKey[] | null {
  for (const r of RULES) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) {
      return r.anyOf;
    }
  }
  return null;
}

/**
 * Superadmin-only routes (no feature can substitute).
 * Returns true if the path requires the superadmin system role.
 */
export function adminRouteRequiresSuperadmin(pathname: string): boolean {
  return pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");
}
