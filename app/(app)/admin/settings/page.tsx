import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/Settings";
import { Card } from "@/components/ui/card";
import { SettingsForms } from "@/components/admin/settings-forms";
import { requireRole } from "@/lib/rbac";

export default async function AdminSettings() {
  await requireRole("superadmin");
  await connectDB();
  const settings = await getSettings();
  return (
    <Card>
      <h2 className="font-semibold mb-3">League settings</h2>
      <SettingsForms announcement={settings.announcement ?? ""} />
    </Card>
  );
}
