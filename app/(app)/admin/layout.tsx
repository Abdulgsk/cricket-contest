import Link from "next/link";
import { requireRole } from "@/lib/rbac";
import { Card } from "@/components/ui/card";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin", "superadmin");
  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">⚙️ Admin</h1>
          <p className="text-xs text-muted-foreground">Manage matches, results & users.</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href="/admin" className="rounded-lg px-3 py-1.5 hover:bg-muted">Overview</Link>
          <Link href="/admin/matches" className="rounded-lg px-3 py-1.5 hover:bg-muted">Matches</Link>
          <Link href="/admin/users" className="rounded-lg px-3 py-1.5 hover:bg-muted">Users</Link>
          <Link href="/admin/settings" className="rounded-lg px-3 py-1.5 hover:bg-muted">Settings</Link>
        </nav>
      </Card>
      {children}
    </div>
  );
}
