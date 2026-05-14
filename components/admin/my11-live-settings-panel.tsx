"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { updateMy11LiveRefreshAction } from "@/actions/admin";

export function My11LiveSettingsPanel({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial));
  const [pending, start] = useTransition();

  const save = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 5 || n > 600) {
      toast.error("Enter 5 – 600 seconds");
      return;
    }
    start(async () => {
      const res = await updateMy11LiveRefreshAction(n);
      if (res.ok) {
        toast.success(`Live refresh set to ${res.value}s`);
        setValue(String(res.value));
      } else {
        toast.error("Failed to save");
      }
    });
  };

  return (
    <Card className="border-border/70">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold text-sm sm:text-base">Contests live refresh</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How often the Contests page polls My11 for fresh team scores while a user is viewing it.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="my11refresh" className="text-[11px]">Seconds (5–600)</Label>
            <Input
              id="my11refresh"
              type="number"
              min={5}
              max={600}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-28"
            />
          </div>
          <Button size="sm" onClick={save} loading={pending}>Save</Button>
        </div>
      </div>
    </Card>
  );
}
