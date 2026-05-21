import Link from "next/link";
import { headers } from "next/headers";
import { requireAdminAccess, userHasFeature } from "@/lib/rbac";
import { Card } from "@/components/ui/card";

type NavItem = { href: string; label: string };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdminAccess();
  const canSeeMatches =
    userHasFeature(me, "matches.manage") ||
    userHasFeature(me, "results.manage") ||
    userHasFeature(me, "match.lock.extend");
  const canSeeUsers = userHasFeature(me, "users.manage");
  const canSeeLogs = me.role === "superadmin" || userHasFeature(me, "users.manage");
  const isSuperadmin = me.role === "superadmin";

  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/admin";

  const items: NavItem[] = [
    { href: "/admin", label: "Overview" },
    ...(canSeeMatches ? [{ href: "/admin/matches", label: "Matches" }] : []),
    ...(canSeeUsers ? [{ href: "/admin/users", label: "Users" }] : []),
    ...(canSeeLogs ? [{ href: "/admin/audit-logs", label: "Audit logs" }] : []),
    ...(isSuperadmin ? [{ href: "/admin/settings", label: "Settings" }] : []),
  ];

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-primary/8 via-card to-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
              <span className="size-1.5 rounded-full bg-primary" /> Admin
            </div>
            <h1 className="mt-1.5 text-lg sm:text-2xl font-semibold tracking-tight truncate">
              Admin Console
            </h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
              Operations, approvals, and access control.
            </p>
          </div>
        </div>

        <nav
          aria-label="Admin sections"
          className="mt-3 -mx-3 sm:mx-0 flex gap-1.5 overflow-x-auto px-3 sm:px-0 text-sm scrollbar-thin scroll-smooth"
        >
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-xl px-3 py-1.5 whitespace-nowrap transition border " +
                  (active
                    ? "bg-primary/15 text-primary border-primary/30 font-medium shadow-sm"
                    : "border-border bg-card/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground")
                }
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
      </Card>
      {children}
    </div>
  );
}
