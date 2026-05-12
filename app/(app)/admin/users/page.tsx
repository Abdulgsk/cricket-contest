import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { requireRole } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { UserRoleControls } from "@/components/admin/user-role-controls";
import { UserFeatureControls } from "@/components/admin/user-feature-controls";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import type { FeatureKey } from "@/lib/features";

export default async function AdminUsers() {
  const me = await requireRole("admin", "superadmin");
  await connectDB();
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return (
    <Card className="border-border/70 overflow-x-auto">
      <div className="mb-3">
        <h2 className="font-semibold">Users & Access</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Assign role and task permissions from one control area.
        </p>
      </div>
      <table className="w-full text-sm min-w-[860px]">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="text-left">
            <th className="p-2">User</th>
            <th className="p-2">Role</th>
            <th className="p-2 hidden md:table-cell">My11Circle</th>
            <th className="p-2 hidden sm:table-cell">WhatsApp</th>
            <th className="p-2 hidden md:table-cell">Joined</th>
            {me.role === "superadmin" && <th className="p-2 w-[360px]">Role & Permissions</th>}
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
              <td className="p-2 text-muted-foreground hidden md:table-cell">
                {u.my11circleName?.trim() ? u.my11circleName : "—"}
              </td>
              <td className="p-2 text-muted-foreground hidden sm:table-cell">{u.whatsapp ?? "—"}</td>
              <td className="p-2 text-muted-foreground text-xs hidden md:table-cell">{new Date(u.createdAt).toLocaleDateString()}</td>
              {me.role === "superadmin" && (
                <td className="p-2">
                  <div className="space-y-2">
                    <UserRoleControls userId={String(u._id)} role={u.role} self={String(u._id) === String(me._id)} />
                    <UserFeatureControls
                      userId={String(u._id)}
                      initial={(u.enabledFeatures as FeatureKey[] | undefined) ?? []}
                      self={String(u._id) === String(me._id)}
                    />
                    <DeleteUserButton
                      userId={String(u._id)}
                      username={u.username}
                      handle={u.userId}
                      self={String(u._id) === String(me._id)}
                    />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
