"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateCivilWarSettingsAction } from "@/actions/civil-war";

type Cfg = {
  decisiveWin: number;
  decisiveLoss: number;
  splitWin: number;
  splitLoss: number;
};

export function CivilWarSettingsPanel({
  initial,
  canEdit,
}: {
  initial: Cfg;
  canEdit: boolean;
}) {
  const [cfg, setCfg] = useState<Cfg>(initial);
  const [pending, startTransition] = useTransition();

  const update = (key: keyof Cfg, v: number) => setCfg((c) => ({ ...c, [key]: v }));

  const save = () => {
    startTransition(async () => {
      const res = await updateCivilWarSettingsAction(cfg);
      if (res.ok) toast.success("Civil War points saved");
      else toast.error(res.error ?? "Could not save");
    });
  };

  return (
    <Card>
      <h2 className="font-bold text-base mb-1">🛡️ Civil War Points</h2>
      <p className="text-[11px] sm:text-xs text-muted-foreground mb-3">
        Set how many points each member of the winning / losing team earns or loses
        per match. A <strong>decisive</strong> outcome means a team won more 1v1
        rivalries AND scored more fantasy points. A <strong>split</strong> outcome
        means only one of those is true (or a fantasy-points tiebreak).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field
          label="Decisive win"
          value={cfg.decisiveWin}
          onChange={(v) => update("decisiveWin", v)}
          disabled={!canEdit}
        />
        <Field
          label="Decisive loss"
          value={cfg.decisiveLoss}
          onChange={(v) => update("decisiveLoss", v)}
          disabled={!canEdit}
          deductsLabel
        />
        <Field
          label="Split win"
          value={cfg.splitWin}
          onChange={(v) => update("splitWin", v)}
          disabled={!canEdit}
        />
        <Field
          label="Split loss"
          value={cfg.splitLoss}
          onChange={(v) => update("splitLoss", v)}
          disabled={!canEdit}
          deductsLabel
        />
      </div>
      {canEdit && (
        <div className="mt-3 flex justify-end">
          <Button onClick={save} disabled={pending} size="sm">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
      {!canEdit && (
        <p className="text-[11px] text-muted-foreground mt-3">
          You don&apos;t have permission to change these.
        </p>
      )}
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  deductsLabel,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  deductsLabel?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">
        {label} {deductsLabel ? "(deducted)" : "(awarded)"}
      </span>
      <Input
        type="number"
        min={0}
        max={50}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
    </label>
  );
}
