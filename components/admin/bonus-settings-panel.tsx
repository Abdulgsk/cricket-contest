"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { updateBonusSettingsAction } from "@/actions/admin";

type BonusConfigInput = {
  consistency: number;
  kingSlayer: number;
  comeback: number;
  underdog: number;
  matchDomination: number;
  bounty: number;
  rivalry: number;
  rivalryRevenge: number;
};

type ConditionType =
  | "fantasy_points_gte"
  | "rank_lte"
  | "leaderboard_climb_gte"
  | "beat_pre_match_leader_fp"
  | "top_n_by_fantasy_points";

type CustomBonusInput = {
  id: string;
  name: string;
  points: number;
  basis: string;
  conditionType: ConditionType;
  conditionValue?: number;
  active: boolean;
};

const CONDITION_LABELS: Record<ConditionType, string> = {
  fantasy_points_gte: "Fantasy points >= value",
  rank_lte: "Match rank <= value",
  leaderboard_climb_gte: "Leaderboard climb >= value",
  beat_pre_match_leader_fp: "Beat pre-match leaderboard #1 by fantasy points",
  top_n_by_fantasy_points: "Top N by fantasy points in match",
};

const NEEDS_VALUE: Record<ConditionType, boolean> = {
  fantasy_points_gte: true,
  rank_lte: true,
  leaderboard_climb_gte: true,
  beat_pre_match_leader_fp: false,
  top_n_by_fantasy_points: true,
};

export function BonusSettingsPanel({
  initialBonusConfig,
  initialCustomBonuses,
  canEdit,
}: {
  initialBonusConfig: BonusConfigInput;
  initialCustomBonuses: CustomBonusInput[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [bonusConfig, setBonusConfig] = useState<BonusConfigInput>(initialBonusConfig);
  const [customBonuses, setCustomBonuses] = useState<CustomBonusInput[]>(initialCustomBonuses);

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
        conditionType: "fantasy_points_gte",
        conditionValue: 0,
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

  const save = () =>
    start(async () => {
      const cleaned = customBonuses
        .filter((b) => b.name.trim() && b.basis.trim())
        .map((b) => ({
          ...b,
          name: b.name.trim(),
          basis: b.basis.trim(),
          conditionValue: NEEDS_VALUE[b.conditionType] ? Number(b.conditionValue ?? 0) : undefined,
        }));
      const res = await updateBonusSettingsAction({
        bonusConfig,
        customBonuses: cleaned,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save bonus settings");
        return;
      }
      toast.success("Bonus wiring updated");
    });

  return (
    <Card>
      <h2 className="font-semibold mb-2">Bonus wiring</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Configure points and logic here. Bonuses are applied when their condition is true.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Top-5 by fantasy points for 3 matches</Label>
          <Input type="number" min={0} value={bonusConfig.consistency} onChange={(e) => setConfigField("consistency", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Beat pre-match leaderboard #1 by fantasy points</Label>
          <Input type="number" min={0} value={bonusConfig.kingSlayer} onChange={(e) => setConfigField("kingSlayer", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Leaderboard climb 4+ positions</Label>
          <Input type="number" min={0} value={bonusConfig.comeback} onChange={(e) => setConfigField("comeback", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Underdog rule</Label>
          <Input type="number" min={0} value={bonusConfig.underdog} onChange={(e) => setConfigField("underdog", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Match domination (300+ FP margin)</Label>
          <Input type="number" min={0} value={bonusConfig.matchDomination} onChange={(e) => setConfigField("matchDomination", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Bounty reward</Label>
          <Input type="number" min={0} value={bonusConfig.bounty} onChange={(e) => setConfigField("bounty", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Rivalry win</Label>
          <Input type="number" min={0} value={bonusConfig.rivalry} onChange={(e) => setConfigField("rivalry", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Rivalry revenge extra</Label>
          <Input type="number" min={0} value={bonusConfig.rivalryRevenge} onChange={(e) => setConfigField("rivalryRevenge", e.target.value)} disabled={!canEdit} />
        </div>
      </div>

      <div className="mt-5 space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Custom bonuses</h3>
          <Button variant="outline" size="sm" onClick={addCustomBonus} loading={pending} disabled={!canEdit}>
            Add custom bonus
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Define condition + points. If condition is satisfied, points are added.</p>

        <div className="space-y-2">
          {customBonuses.map((bonus, idx) => (
            <div key={bonus.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
                <Input
                  placeholder="Bonus title"
                  value={bonus.name}
                  onChange={(e) => updateCustomBonus(idx, { name: e.target.value })}
                  disabled={!canEdit}
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Points"
                  value={bonus.points}
                  onChange={(e) => updateCustomBonus(idx, { points: Number(e.target.value) || 0 })}
                  disabled={!canEdit}
                />
              </div>

              <select
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                value={bonus.conditionType}
                onChange={(e) => {
                  const next = e.target.value as ConditionType;
                  updateCustomBonus(idx, {
                    conditionType: next,
                    conditionValue: NEEDS_VALUE[next] ? bonus.conditionValue ?? 0 : undefined,
                  });
                }}
                disabled={!canEdit}
              >
                {Object.entries(CONDITION_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>

              {NEEDS_VALUE[bonus.conditionType] && (
                <Input
                  type="number"
                  min={0}
                  placeholder="Condition value"
                  value={bonus.conditionValue ?? 0}
                  onChange={(e) => updateCustomBonus(idx, { conditionValue: Number(e.target.value) || 0 })}
                  disabled={!canEdit}
                />
              )}

              <Textarea
                rows={2}
                placeholder="Rule description (shown on Rules page)"
                value={bonus.basis}
                onChange={(e) => updateCustomBonus(idx, { basis: e.target.value })}
                disabled={!canEdit}
              />

              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={bonus.active}
                    onChange={(e) => updateCustomBonus(idx, { active: e.target.checked })}
                    disabled={!canEdit}
                  />
                  Active
                </label>
                <Button variant="outline" size="sm" onClick={() => removeCustomBonus(idx)} loading={pending} disabled={!canEdit}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {!customBonuses.length && <p className="text-xs text-muted-foreground">No custom bonuses.</p>}
        </div>
      </div>

      <div className="mt-4">
        <Button variant="glow" onClick={save} loading={pending} disabled={!canEdit}>
          Save bonus wiring
        </Button>
      </div>
    </Card>
  );
}
