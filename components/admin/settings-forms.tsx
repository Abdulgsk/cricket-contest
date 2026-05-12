"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { setAnnouncementAction, updateBonusSettingsAction } from "@/actions/admin";

type BonusConfigInput = {
  consistency: number;
  kingSlayer: number;
  comeback: number;
  underdog: number;
  matchDomination: number;
  bounty: number;
  rivalry: number;
  rivalryRevenge: number;
  maxBonusPerMatch: number;
};

type CustomBonusInput = {
  id: string;
  name: string;
  points: number;
  basis: string;
  active: boolean;
};

export function SettingsForms({
  announcement,
  canEditBonusSettings,
  initialBonusConfig,
  initialCustomBonuses,
}: {
  announcement: string;
  canEditBonusSettings: boolean;
  initialBonusConfig: BonusConfigInput;
  initialCustomBonuses: CustomBonusInput[];
}) {
  const [text, setText] = useState(announcement);
  const [bonusConfig, setBonusConfig] = useState<BonusConfigInput>(initialBonusConfig);
  const [customBonuses, setCustomBonuses] = useState<CustomBonusInput[]>(initialCustomBonuses);
  const [pending, start] = useTransition();

  function setConfigField<K extends keyof BonusConfigInput>(key: K, value: string) {
    const parsed = Number(value);
    setBonusConfig((prev) => ({ ...prev, [key]: Number.isNaN(parsed) ? 0 : parsed }));
  }

  function addCustomBonus() {
    setCustomBonuses((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        points: 0,
        basis: "",
        active: true,
      },
    ]);
  }

  function updateCustomBonus(idx: number, patch: Partial<CustomBonusInput>) {
    setCustomBonuses((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }

  function removeCustomBonus(idx: number) {
    setCustomBonuses((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Announcement</Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              await setAnnouncementAction(text);
              toast.success("Announcement updated");
            })
          }
        >
          Save announcement
        </Button>
      </div>

      {canEditBonusSettings ? (
        <div className="space-y-4 border-t border-border pt-4">
          <div>
            <h3 className="font-semibold">Bonus points workflow</h3>
            <p className="text-xs text-muted-foreground">
              Change points for existing bonuses and add custom bonus definitions without touching code.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Top-5 for 3 matches (fantasy points)</Label>
              <Input type="number" min={0} value={bonusConfig.consistency} onChange={(e) => setConfigField("consistency", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Beat leaderboard #1 by fantasy points</Label>
              <Input type="number" min={0} value={bonusConfig.kingSlayer} onChange={(e) => setConfigField("kingSlayer", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Climb 4+ leaderboard places</Label>
              <Input type="number" min={0} value={bonusConfig.comeback} onChange={(e) => setConfigField("comeback", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Underdog bonus</Label>
              <Input type="number" min={0} value={bonusConfig.underdog} onChange={(e) => setConfigField("underdog", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Match domination bonus</Label>
              <Input type="number" min={0} value={bonusConfig.matchDomination} onChange={(e) => setConfigField("matchDomination", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Bounty bonus</Label>
              <Input type="number" min={0} value={bonusConfig.bounty} onChange={(e) => setConfigField("bounty", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Rivalry win</Label>
              <Input type="number" min={0} value={bonusConfig.rivalry} onChange={(e) => setConfigField("rivalry", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Rivalry revenge extra</Label>
              <Input type="number" min={0} value={bonusConfig.rivalryRevenge} onChange={(e) => setConfigField("rivalryRevenge", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Max bonus per match</Label>
              <Input type="number" min={0} value={bonusConfig.maxBonusPerMatch} onChange={(e) => setConfigField("maxBonusPerMatch", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium">Custom bonus rules</h4>
              <Button variant="outline" onClick={addCustomBonus} loading={pending}>Add bonus</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add extra rules with clear descriptions. These appear on the Rules page.
            </p>
            <div className="space-y-2">
              {customBonuses.map((bonus, idx) => (
                <div key={bonus.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                    <Input
                      placeholder="Bonus name"
                      value={bonus.name}
                      onChange={(e) => updateCustomBonus(idx, { name: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Points"
                      value={bonus.points}
                      onChange={(e) => updateCustomBonus(idx, { points: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="What is this based on?"
                    value={bonus.basis}
                    onChange={(e) => updateCustomBonus(idx, { basis: e.target.value })}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs text-muted-foreground flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bonus.active}
                        onChange={(e) => updateCustomBonus(idx, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <Button variant="outline" onClick={() => removeCustomBonus(idx)} loading={pending}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
              {!customBonuses.length && (
                <p className="text-xs text-muted-foreground">No custom bonuses yet.</p>
              )}
            </div>
          </div>

          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const cleaned = customBonuses
                  .filter((b) => b.name.trim() && b.basis.trim())
                  .map((b) => ({
                    ...b,
                    name: b.name.trim(),
                    basis: b.basis.trim(),
                  }));
                const res = await updateBonusSettingsAction({
                  bonusConfig,
                  customBonuses: cleaned,
                });
                if (!res.ok) {
                  toast.error(res.error ?? "Failed to update bonus settings");
                  return;
                }
                toast.success("Bonus settings updated");
              })
            }
          >
            Save bonus settings
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground border-t border-border pt-4">
          Bonus settings can be changed only by superadmin.
        </p>
      )}
    </div>
  );
}
