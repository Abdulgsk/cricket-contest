import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/Settings";
import { Card } from "@/components/ui/card";
import { SettingsForms } from "@/components/admin/settings-forms";
import { requireRole } from "@/lib/rbac";
import { BONUSES, MAX_BONUS_PER_MATCH } from "@/lib/constants";

export default async function AdminSettings() {
  const me = await requireRole("admin", "superadmin");
  await connectDB();
  const settings = await getSettings();
  const bonusConfig = {
    consistency: settings.bonusConfig?.consistency ?? BONUSES.CONSISTENCY,
    kingSlayer: settings.bonusConfig?.kingSlayer ?? BONUSES.KING_SLAYER,
    comeback: settings.bonusConfig?.comeback ?? BONUSES.COMEBACK,
    underdog: settings.bonusConfig?.underdog ?? BONUSES.UNDERDOG,
    matchDomination: settings.bonusConfig?.matchDomination ?? BONUSES.MATCH_DOMINATION,
    bounty: settings.bonusConfig?.bounty ?? BONUSES.BOUNTY,
    rivalry: settings.bonusConfig?.rivalry ?? BONUSES.RIVALRY,
    rivalryRevenge: settings.bonusConfig?.rivalryRevenge ?? 1,
    maxBonusPerMatch: settings.bonusConfig?.maxBonusPerMatch ?? MAX_BONUS_PER_MATCH,
  };
  return (
    <Card>
      <h2 className="font-semibold mb-3">League settings</h2>
      <SettingsForms
        announcement={settings.announcement ?? ""}
        canEditBonusSettings={me.role === "superadmin"}
        initialBonusConfig={bonusConfig}
        initialCustomBonuses={
          (settings.customBonuses ?? []).map((b) => ({
            id: b.id,
            name: b.name,
            points: b.points,
            basis: b.basis,
            active: b.active,
          }))
        }
      />
    </Card>
  );
}
