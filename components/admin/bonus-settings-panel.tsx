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
  topperDefendsTop: number;
  topperTopsMatch: number;
  captainTeamWin: number;
  leaderTopperBonus: number;
  bounty: number;
  rivalry: number;
  rivalryRevenge: number;
};

type ConditionType =
  | "fantasy_points_gte"
  | "fantasy_points_lte"
  | "rank_lte"
  | "rank_gte"
  | "leaderboard_climb_gte"
  | "leaderboard_drop_gte"
  | "pre_match_table_pos_lte"
  | "pre_match_table_pos_gte"
  | "post_match_table_pos_lte"
  | "post_match_table_pos_gte"
  | "beat_pre_match_leader_fp"
  | "top_n_by_fantasy_points"
  | "bottom_n_by_fantasy_points"
  | "missed_match"
  | "played_match";

type RuleConditionInput = {
  conditionType: ConditionType;
  conditionValue?: number;
};

type CustomBonusInput = {
  id: string;
  name: string;
  points: number;
  basis: string;
  action: "add" | "deduct";
  conditionLogic: "all" | "any";
  conditions: RuleConditionInput[];
  active: boolean;
};

const CONDITION_LABELS: Record<ConditionType, string> = {
  fantasy_points_gte: "Fantasy points >= value",
  fantasy_points_lte: "Fantasy points <= value",
  rank_lte: "Match rank <= value",
  rank_gte: "Match rank >= value",
  leaderboard_climb_gte: "Leaderboard climb >= value",
  leaderboard_drop_gte: "Leaderboard drop >= value",
  pre_match_table_pos_lte: "Pre-match table position <= value",
  pre_match_table_pos_gte: "Pre-match table position >= value",
  post_match_table_pos_lte: "Post-match table position <= value",
  post_match_table_pos_gte: "Post-match table position >= value",
  beat_pre_match_leader_fp: "Beat pre-match leaderboard #1 by fantasy points",
  top_n_by_fantasy_points: "Top N by fantasy points in match",
  bottom_n_by_fantasy_points: "Bottom N by fantasy points in match",
  missed_match: "Missed this match",
  played_match: "Played this match",
};

const NEEDS_VALUE: Record<ConditionType, boolean> = {
  fantasy_points_gte: true,
  fantasy_points_lte: true,
  rank_lte: true,
  rank_gte: true,
  leaderboard_climb_gte: true,
  leaderboard_drop_gte: true,
  pre_match_table_pos_lte: true,
  pre_match_table_pos_gte: true,
  post_match_table_pos_lte: true,
  post_match_table_pos_gte: true,
  beat_pre_match_leader_fp: false,
  top_n_by_fantasy_points: true,
  bottom_n_by_fantasy_points: true,
  missed_match: false,
  played_match: false,
};

export function BonusSettingsPanel({
  initialBonusConfig,
  initialCustomBonuses,
  canEdit,
}: {
  initialBonusConfig: BonusConfigInput;
  initialCustomBonuses: Array<{
    id: string;
    name: string;
    points: number;
    basis: string;
    active: boolean;
    action?: "add" | "deduct";
    conditionLogic?: "all" | "any";
    conditionType?: ConditionType;
    conditionValue?: number;
    conditions?: Array<{ conditionType: string; conditionValue?: number }>;
  }>;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [bonusConfig, setBonusConfig] = useState<BonusConfigInput>(initialBonusConfig);
  const [customBonuses, setCustomBonuses] = useState<CustomBonusInput[]>(
    initialCustomBonuses.map((b) => {
      const withRules = b;
      return {
        id: b.id,
        name: b.name,
        points: b.points,
        basis: b.basis,
        active: b.active,
        action: withRules.action ?? "add",
        conditionLogic: withRules.conditionLogic ?? "all",
        conditions:
          withRules.conditions && withRules.conditions.length
            ? withRules.conditions.map((c) => ({
                conditionType: c.conditionType as ConditionType,
                conditionValue: c.conditionValue,
              }))
            : [
                {
                  conditionType: withRules.conditionType ?? "fantasy_points_gte",
                  conditionValue: withRules.conditionValue,
                },
              ],
      };
    })
  );

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
        action: "add",
        conditionLogic: "all",
        conditions: [{ conditionType: "fantasy_points_gte", conditionValue: 0 }],
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

  function addCondition(ruleIdx: number) {
    setCustomBonuses((prev) =>
      prev.map((b, i) =>
        i === ruleIdx
          ? {
              ...b,
              conditions: [...b.conditions, { conditionType: "fantasy_points_gte", conditionValue: 0 }],
            }
          : b
      )
    );
  }

  function removeCondition(ruleIdx: number, condIdx: number) {
    setCustomBonuses((prev) =>
      prev.map((b, i) =>
        i === ruleIdx
          ? { ...b, conditions: b.conditions.filter((_, j) => j !== condIdx) }
          : b
      )
    );
  }

  function updateCondition(
    ruleIdx: number,
    condIdx: number,
    patch: Partial<RuleConditionInput>
  ) {
    setCustomBonuses((prev) =>
      prev.map((b, i) =>
        i === ruleIdx
          ? {
              ...b,
              conditions: b.conditions.map((c, j) => (j === condIdx ? { ...c, ...patch } : c)),
            }
          : b
      )
    );
  }

  const save = () =>
    start(async () => {
      const cleaned = customBonuses
        .filter((b) => b.name.trim() && b.basis.trim() && b.conditions.length > 0)
        .map((b) => ({
          ...b,
          name: b.name.trim(),
          basis: b.basis.trim(),
          conditions: b.conditions.map((c) => ({
            conditionType: c.conditionType,
            conditionValue: NEEDS_VALUE[c.conditionType] ? Number(c.conditionValue ?? 0) : undefined,
          })),
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
          <Label>Leaderboard topper stays #1 after match</Label>
          <Input type="number" min={0} value={bonusConfig.topperDefendsTop} onChange={(e) => setConfigField("topperDefendsTop", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Leaderboard topper also tops match (My11)</Label>
          <Input type="number" min={0} value={bonusConfig.topperTopsMatch} onChange={(e) => setConfigField("topperTopsMatch", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label>Leader topper override (outsider beats both captains)</Label>
          <Input type="number" min={0} value={bonusConfig.leaderTopperBonus} onChange={(e) => setConfigField("leaderTopperBonus", e.target.value)} disabled={!canEdit} />
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
          <h3 className="font-medium">Custom workflow rules</h3>
          <Button variant="outline" size="sm" onClick={addCustomBonus} loading={pending} disabled={!canEdit}>
            Add rule
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Build rules like: if conditions match, then add or deduct points. You can combine multiple conditions with ALL or ANY logic.
        </p>

        <div className="space-y-2">
          {customBonuses.map((bonus, idx) => (
            <div key={bonus.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                <Input
                  placeholder="Rule title"
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

              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                  value={bonus.action}
                  onChange={(e) => updateCustomBonus(idx, { action: e.target.value as "add" | "deduct" })}
                  disabled={!canEdit}
                >
                  <option value="add">Action: Add points</option>
                  <option value="deduct">Action: Deduct points</option>
                </select>
                <select
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                  value={bonus.conditionLogic}
                  onChange={(e) => updateCustomBonus(idx, { conditionLogic: e.target.value as "all" | "any" })}
                  disabled={!canEdit}
                >
                  <option value="all">Condition logic: ALL must match</option>
                  <option value="any">Condition logic: ANY can match</option>
                </select>
              </div>

              <div className="space-y-2 rounded-lg bg-muted/20 p-2">
                {bonus.conditions.map((cond, condIdx) => (
                  <div key={`${bonus.id}-${condIdx}`} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                    <select
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                      value={cond.conditionType}
                      onChange={(e) => {
                        const next = e.target.value as ConditionType;
                        updateCondition(idx, condIdx, {
                          conditionType: next,
                          conditionValue: NEEDS_VALUE[next] ? cond.conditionValue ?? 0 : undefined,
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
                    {NEEDS_VALUE[cond.conditionType] ? (
                      <Input
                        type="number"
                        min={0}
                        placeholder="Value"
                        value={cond.conditionValue ?? 0}
                        onChange={(e) => updateCondition(idx, condIdx, { conditionValue: Number(e.target.value) || 0 })}
                        disabled={!canEdit}
                      />
                    ) : (
                      <div className="h-11 rounded-xl border border-border bg-card px-3 text-xs text-muted-foreground flex items-center">
                        No value needed
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeCondition(idx, condIdx)}
                      disabled={!canEdit || bonus.conditions.length <= 1}
                    >
                      Remove
                    </Button>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={() => addCondition(idx)} disabled={!canEdit}>
                  Add condition
                </Button>
              </div>

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
