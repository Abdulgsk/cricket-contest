import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/Settings";
import { Card } from "@/components/ui/card";
import { SettingsForms } from "@/components/admin/settings-forms";

export default async function AdminSettings() {
  await connectDB();
  const settings = await getSettings();
  return (
    <Card>
      <h2 className="font-semibold mb-3">League settings</h2>
      <SettingsForms announcement={settings.announcement ?? ""} />
    </Card>
  );
}
