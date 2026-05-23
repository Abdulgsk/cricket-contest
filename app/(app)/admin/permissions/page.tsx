import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { Role } from "@/models/Role";
import { requireAdminAccess, userCan } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { NoAccessCard } from "@/components/no-access-card";
import {
  PermissionEditor,
  type EditorUser,
} from "@/components/admin/permission-editor";
import { bitmapToKeys, keysToBitmap, type FeatureKey } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function AdminPermissionsPage() {
  const me = await requireAdminAccess();
  if (!userCan(me, "users.roles.assign")) {
    return <NoAccessCard feature="users.roles.assign" title="Permissions" />;
  }

  await connectDB();
  const [users, roles] = await Promise.all([
    User.find()
      .select("username userId role permissionBitmap enabledFeatures customRoleId")
      .sort({ username: 1 })
      .lean(),
    Role.find().select("name permissionBitmap features").lean(),
  ]);

  const roleById = new Map(
    roles.map((r) => {
      // Prefer bitmap; fall back to legacy `features[]` for unmigrated docs.
      const bitmap =
        r.permissionBitmap && r.permissionBitmap !== "0"
          ? r.permissionBitmap
          : keysToBitmap((r.features ?? []) as FeatureKey[]);
      return [
        String(r._id),
        {
          name: r.name as string,
          features: bitmapToKeys(bitmap),
        },
      ];
    }),
  );

  const rows: EditorUser[] = users.map((u) => {
    const customRoleId = u.customRoleId ? String(u.customRoleId) : null;
    const role = customRoleId ? roleById.get(customRoleId) : null;
    const directBitmap =
      u.permissionBitmap && u.permissionBitmap !== "0"
        ? u.permissionBitmap
        : keysToBitmap((u.enabledFeatures ?? []) as FeatureKey[]);
    return {
      id: String(u._id),
      username: u.username as string,
      handle: u.userId as string,
      role: u.role as EditorUser["role"],
      customRoleName: role?.name ?? null,
      directFeatures: bitmapToKeys(directBitmap),
      roleFeatures: role?.features ?? [],
    };
  });

  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">Permissions</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-prose">
              Pick a user on the left, flip switches on the right. Changes save
              instantly. Items tagged{" "}
              <span className="rounded bg-blue-500/15 text-blue-300 px-1 py-0.5 text-[10px]">
                from role
              </span>{" "}
              come from the user&apos;s custom role — manage those bundles in{" "}
              <a href="/admin/users" className="underline">
                Users
              </a>
              .
            </p>
          </div>
          <a
            href="/developer/audit-logs"
            className="text-xs text-muted-foreground underline self-start"
          >
            View audit trail →
          </a>
        </div>
        <PermissionEditor users={rows} selfId={String(me._id)} />
      </Card>
    </div>
  );
}
