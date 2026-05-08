import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { getSettings } from "@/models/Settings";
import { Card } from "@/components/ui/card";
import { SettingsForms } from "@/components/admin/settings-forms";

export default async function AdminSettings() {
  await connectDB();
  const [settings, users] = await Promise.all([
    getSettings(),
    User.find().sort({ username: 1 }).lean(),
  ]);
  return (
    <Card>
      <h2 className="font-semibold mb-3">League settings</h2>
      <SettingsForms
        announcement={settings.announcement ?? ""}
        bountyHolder={settings.bountyHolderUserId ? String(settings.bountyHolderUserId) : ""}
        users={users.map((u) => ({ id: String(u._id), name: u.username, handle: u.userId }))}
      />
    </Card>
  );
}
