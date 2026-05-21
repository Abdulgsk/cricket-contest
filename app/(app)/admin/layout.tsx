import Link from "next/link";
import { requireAdminAccess, userHasFeature } from "@/lib/rbac";
import { Card } from "@/components/ui/card";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdminAccess();
  const canSeeMatches =
    userHasFeature(me, "matches.manage") ||
    userHasFeature(me, "results.manage") ||
    userHasFeature(me, "match.lock.extend");
  const canSeeUsers = userHasFeature(me, "users.manage");
  const isSuperadmin = me.role === "superadmin";
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Admin Console</h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground">Operations, approvals, and access control.</p>
        </div>
        <nav className="-mx-1 sm:mx-0 flex gap-1.5 overflow-x-auto px-1 sm:px-0 text-sm scrollbar-thin">
          <Link href="/admin" className="rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted/50 whitespace-nowrap">Overview</Link>
          {canSeeMatches && (
            <Link href="/admin/matches" className="rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted/50 whitespace-nowrap">Matches</Link>
          )}
          {canSeeUsers && (
            <Link href="/admin/users" className="rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted/50 whitespace-nowrap">Users</Link>
          )}
          {isSuperadmin && (
            <Link href="/admin/settings" className="rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted/50 whitespace-nowrap">Settings</Link>
          )}
        </nav>
      </Card>
      {children}
    </div>
  );
}
