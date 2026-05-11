import Link from "next/link";
import { requireRole } from "@/lib/rbac";
import { Card } from "@/components/ui/card";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin", "superadmin");
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">⚙️ Admin</h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground">Manage matches, results & users.</p>
        </div>
        <nav className="-mx-1 sm:mx-0 flex gap-1.5 overflow-x-auto px-1 sm:px-0 text-sm scrollbar-thin">
          <Link href="/admin" className="rounded-lg px-3 py-1.5 hover:bg-muted bg-muted/40 whitespace-nowrap">Overview</Link>
          <Link href="/admin/matches" className="rounded-lg px-3 py-1.5 hover:bg-muted bg-muted/40 whitespace-nowrap">Matches</Link>
          <Link href="/admin/users" className="rounded-lg px-3 py-1.5 hover:bg-muted bg-muted/40 whitespace-nowrap">Users</Link>
          <Link href="/admin/settings" className="rounded-lg px-3 py-1.5 hover:bg-muted bg-muted/40 whitespace-nowrap">Settings</Link>
        </nav>
      </Card>
      {children}
    </div>
  );
}
