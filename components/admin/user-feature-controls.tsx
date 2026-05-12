"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from "@/lib/features";
import { setUserFeaturesAction } from "@/actions/admin";

export function UserFeatureControls({
  userId,
  initial,
  self,
}: {
  userId: string;
  initial: FeatureKey[];
  self: boolean;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<FeatureKey[]>(initial);
  const setValue = useMemo(() => new Set(selected), [selected]);

  const toggle = (key: FeatureKey) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  if (self) return <span className="text-xs text-muted-foreground">(you)</span>;

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">Feature permissions</p>
      <div className="grid gap-1.5">
        {FEATURE_KEYS.map((k) => (
          <label key={k} className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={setValue.has(k)}
              onChange={() => toggle(k)}
              disabled={pending}
            />
            {FEATURE_LABELS[k]}
          </label>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await setUserFeaturesAction({ targetUserId: userId, features: selected });
            if (!res.ok) {
              toast.error(res.error ?? "Failed to save feature access");
              return;
            }
            toast.success("Feature access updated");
          })
        }
      >
        Save features
      </Button>
    </div>
  );
}