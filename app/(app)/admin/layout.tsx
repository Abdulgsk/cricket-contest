import { headers } from "next/headers";
import { requireAdminAccess } from "@/lib/rbac";
import {
  getAccessibleAdminRoutes,
  getAdminRouteForPath,
} from "@/lib/admin-route-access";
import { Card } from "@/components/ui/card";
import { PermissionsProvider } from "@/components/permissions";
import { NoAccessCard } from "@/components/no-access-card";
import { AdminNavTabs } from "@/components/admin/admin-nav-tabs";
import { connectDB } from "@/lib/db";
import { Role } from "@/models/Role";
import type { FeatureKey } from "@/lib/features";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/admin";

  // Ensure the user can see the admin shell at all. Per-feature access for
  // individual sub-pages is enforced by each page rendering a NoAccessCard
  // when needed — we don't redirect them away from a directly-typed URL.
  const me = await requireAdminAccess();
  const route = getAdminRouteForPath(pathname);
  const features = (me.enabledFeatures ?? []) as FeatureKey[];
  const isSuperadmin = me.role === "superadmin";

  // Resolve the display label for the user's role.
  let roleLabel = "Admin";
  if (isSuperadmin) {
    roleLabel = "Superadmin";
  } else if (me.customRoleId) {
    try {
      await connectDB();
      const r = await Role.findById(me.customRoleId).lean<{ name: string } | null>();
      if (r?.name) roleLabel = r.name;
    } catch {
      /* fall back to default label */
    }
  }

  // Nav lists only the routes the user can actually access.
  const items = getAccessibleAdminRoutes(me).map((r) => ({
    href: r.path,
    label: r.label as string,
  }));

  // If the page is superadmin-only and the user isn't, render the NoAccess
  // card in place of the page content (don't redirect — preserves URL and
  // explains why).
  const blockedSuperadminOnly =
    !!route && route.superadminOnly && !isSuperadmin;
  // If the page requires features the user doesn't have, same treatment.
  const blockedFeature =
    !!route &&
    !route.superadminOnly &&
    route.anyOf.length > 0 &&
    !isSuperadmin &&
    !route.anyOf.some((f) => features.includes(f));

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-primary/8 via-card to-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
              <span className="size-1.5 rounded-full bg-primary" /> {roleLabel}
            </div>
            <h1 className="mt-1.5 text-lg sm:text-2xl font-semibold tracking-tight truncate">
              Admin Console
            </h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
              Operations, approvals, and access control.
            </p>
          </div>
        </div>

        <AdminNavTabs items={items} />
      </Card>
      <PermissionsProvider features={features} isSuperadmin={isSuperadmin}>
        {blockedSuperadminOnly ? (
          <NoAccessCard
            title="Superadmin only"
            hint="This section is restricted to the league superadmin."
          />
        ) : blockedFeature && route ? (
          <NoAccessCard anyOf={[...route.anyOf]} />
        ) : (
          children
        )}
      </PermissionsProvider>
    </div>
  );
}

