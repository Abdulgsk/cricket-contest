import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/Settings";
import { Card } from "@/components/ui/card";
import { SettingsForms } from "@/components/admin/settings-forms";
import { requireAdminAccess } from "@/lib/rbac";

export default async function AdminSettings() {
  // Route access is enforced by app/(app)/admin/layout.tsx via the central
  // ADMIN_ROUTES registry (settings is superadminOnly).
  await requireAdminAccess();
  await connectDB();
  const settings = await getSettings();
  return (
    <Card>
      <h2 className="font-semibold mb-3">League settings</h2>
      <SettingsForms announcement={settings.announcement ?? ""} />
    </Card>
  );
}
