"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type FeatureKey } from "@/lib/features";
import { FeatureChecklist } from "@/components/admin/feature-checklist";
import { setUserFeaturesAction } from "@/actions/admin";

export function UserFeatureControls({
  userId,
  initial,
  self,
  systemRole,
  hasCustomRole,
}: {
  userId: string;
  initial: FeatureKey[];
  self: boolean;
  systemRole?: "user" | "admin" | "superadmin";
  hasCustomRole?: boolean;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<FeatureKey[]>(initial);
  const isSuperadmin = systemRole === "superadmin";

  if (self) return <span className="text-xs text-muted-foreground">(you)</span>;

  return (
    <details className="rounded-xl border border-border/70 bg-muted/10 group">
      <summary className="flex items-center justify-between gap-2 cursor-pointer select-none px-3 py-2.5 text-xs font-medium">
        <span>
          Direct features{" "}
          {hasCustomRole ? (
            <span className="text-muted-foreground font-normal">(stack on top of custom role)</span>
          ) : null}
        </span>
        <span className="text-[10px] text-muted-foreground group-open:rotate-180 transition">
          ▾
        </span>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">
        <FeatureChecklist
          selected={selected}
          onChange={setSelected}
          disabled={pending}
          lockedAllChecked={isSuperadmin}
          lockedHint={isSuperadmin ? "Superadmin — all features always on" : undefined}
        />
        {!isSuperadmin && (
          <div className="flex justify-end">
            <Button
              size="sm"
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
        )}
      </div>
    </details>
  );
}