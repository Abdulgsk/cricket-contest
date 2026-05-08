import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { requireRole } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { UserRoleControls } from "@/components/admin/user-role-controls";

export default async function AdminUsers() {
  const me = await requireRole("admin", "superadmin");
  await connectDB();
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return (
    <Card className="overflow-x-auto">
      <h2 className="font-semibold mb-3">Users</h2>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="text-left">
            <th className="p-2">User</th>
            <th className="p-2">Role</th>
            <th className="p-2">WhatsApp</th>
            <th className="p-2">Joined</th>
            {me.role === "superadmin" && <th className="p-2">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={String(u._id)} className="border-t border-border/40">
              <td className="p-2">
                <div className="font-medium">{u.username}</div>
                <div className="text-xs text-muted-foreground">@{u.userId}</div>
              </td>
              <td className="p-2">
                <Badge tone={u.role === "superadmin" ? "warning" : u.role === "admin" ? "accent" : "default"}>
                  {u.role}
                </Badge>
              </td>
              <td className="p-2 text-muted-foreground">{u.whatsapp ?? "—"}</td>
              <td className="p-2 text-muted-foreground text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
              {me.role === "superadmin" && (
                <td className="p-2">
                  <UserRoleControls userId={String(u._id)} role={u.role} self={String(u._id) === String(me._id)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
