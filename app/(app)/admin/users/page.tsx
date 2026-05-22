import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { Role } from "@/models/Role";
import { requireAdminAccess, userHasFeature } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { UserRoleAssign } from "@/components/admin/user-role-assign";
import { DeleteUserButton } from "@/components/admin/delete-user-button";
import { RolesEditor, type CustomRoleRow } from "@/components/admin/roles-editor";
import type { FeatureKey } from "@/lib/features";

export default async function AdminUsers() {
  // Route access is enforced by app/(app)/admin/layout.tsx.
  const me = await requireAdminAccess();
  const canAssignRoles = me.role === "superadmin" || userHasFeature(me, "users.roles.assign");
  const canDeleteUsers = me.role === "superadmin" || userHasFeature(me, "users.delete");
  const canManageRoleCatalog = me.role === "superadmin" || userHasFeature(me, "users.roles.assign");
  await connectDB();
  const [users, roles] = await Promise.all([
    User.find().sort({ createdAt: -1 }).lean(),
    Role.find().sort({ name: 1 }).lean(),
  ]);

  const customRoleOptions = roles.map((r) => ({ id: String(r._id), name: r.name }));
  const customRoleUsage = new Map<string, number>();
  for (const u of users) {
    if (u.customRoleId) {
      const id = String(u.customRoleId);
      customRoleUsage.set(id, (customRoleUsage.get(id) ?? 0) + 1);
    }
  }
  const editorRoles: CustomRoleRow[] = roles.map((r) => ({
    id: String(r._id),
    name: r.name,
    features: (r.features ?? []) as FeatureKey[],
    usageCount: customRoleUsage.get(String(r._id)) ?? 0,
  }));
  const customRoleNameById = new Map(customRoleOptions.map((r) => [r.id, r.name]));

  return (
    <div className="space-y-4">
      {canManageRoleCatalog && (
        <Card className="border-border/70">
          <RolesEditor initial={editorRoles} />
        </Card>
      )}

      <Card className="border-border/70">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Users &amp; Access</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Pick a system role or a custom role for each user. Fine-tune
              per-user overrides in{" "}
              <a href="/admin/permissions" className="underline">
                Permissions
              </a>
              .
            </p>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {users.length} player{users.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Mobile: stacked cards */}
        <div className="md:hidden space-y-3">
          {users.map((u) => {
            const customId = u.customRoleId ? String(u.customRoleId) : null;
            const customName = customId ? customRoleNameById.get(customId) ?? null : null;
            const isSelf = String(u._id) === String(me._id);
            return (
              <div
                key={String(u._id)}
                className="rounded-xl border border-border/60 bg-card/70 p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.username}</div>
                    <div className="text-xs text-muted-foreground truncate">@{u.userId}</div>
                  </div>
                  {customName ? (
                    <Badge tone="accent">{customName}</Badge>
                  ) : (
                    <Badge tone={u.role === "superadmin" ? "warning" : u.role === "admin" ? "accent" : "default"}>
                      {u.role}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <div>
                    <div className="uppercase tracking-wider text-[10px]">My11Circle</div>
                    <div className="text-foreground truncate">
                      {u.my11circleName?.trim() ? u.my11circleName : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wider text-[10px]">WhatsApp</div>
                    <div className="text-foreground truncate">{u.whatsapp ?? "—"}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wider text-[10px]">Joined</div>
                    <div className="text-foreground">{new Date(u.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                {(canAssignRoles || canDeleteUsers) && (
                  <div className="border-t border-border/40 pt-3 space-y-2">
                    {canAssignRoles && (
                      <UserRoleAssign
                        userId={String(u._id)}
                        currentSystemRole={u.role}
                        currentCustomRoleId={customId}
                        customRoles={customRoleOptions}
                        self={isSelf}
                      />
                    )}
                    {canDeleteUsers && (
                      <DeleteUserButton
                        userId={String(u._id)}
                        username={u.username}
                        handle={u.userId}
                        self={isSelf}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="text-left">
                <th className="p-2">User</th>
                <th className="p-2">Role</th>
                <th className="p-2">My11Circle</th>
                <th className="p-2">WhatsApp</th>
                <th className="p-2">Joined</th>
                {(canAssignRoles || canDeleteUsers) && <th className="p-2 w-[360px]">Role &amp; Permissions</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const customId = u.customRoleId ? String(u.customRoleId) : null;
                const customName = customId ? customRoleNameById.get(customId) ?? null : null;
                const isSelf = String(u._id) === String(me._id);
                return (
                  <tr key={String(u._id)} className="border-t border-border/40">
                    <td className="p-2">
                      <div className="font-medium">{u.username}</div>
                      <div className="text-xs text-muted-foreground">@{u.userId}</div>
                    </td>
                    <td className="p-2">
                      {customName ? (
                        <Badge tone="accent">{customName}</Badge>
                      ) : (
                        <Badge tone={u.role === "superadmin" ? "warning" : u.role === "admin" ? "accent" : "default"}>
                          {u.role}
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {u.my11circleName?.trim() ? u.my11circleName : "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">{u.whatsapp ?? "—"}</td>
                    <td className="p-2 text-muted-foreground text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    {(canAssignRoles || canDeleteUsers) && (
                      <td className="p-2">
                        <div className="space-y-2">
                          {canAssignRoles && (
                            <UserRoleAssign
                              userId={String(u._id)}
                              currentSystemRole={u.role}
                              currentCustomRoleId={customId}
                              customRoles={customRoleOptions}
                              self={isSelf}
                            />
                          )}
                          {canDeleteUsers && (
                            <DeleteUserButton
                              userId={String(u._id)}
                              username={u.username}
                              handle={u.userId}
                              self={isSelf}
                            />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
