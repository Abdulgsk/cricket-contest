"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createMatchAction } from "@/actions/admin";

export function CreateMatchForm() {
  const [pending, start] = useTransition();
  return (
    <Card>
      <h2 className="font-semibold mb-3">Create match</h2>
      <form
        action={(fd) =>
          start(async () => {
            const r = await createMatchAction(fd);
            if (r?.ok) toast.success("Match created");
            else toast.error(r?.error ?? "Failed");
          })
        }
        className="grid md:grid-cols-2 gap-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="teamA">Team A</Label>
          <Input id="teamA" name="teamA" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="teamB">Team B</Label>
          <Input id="teamB" name="teamB" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="venue">Venue</Label>
          <Input id="venue" name="venue" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startTime">Start time</Label>
          <Input id="startTime" name="startTime" type="datetime-local" required />
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="doublePoints" /> 2× Points</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="chaosMatch" /> Chaos</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="noBonus" /> No Bonus</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="predictionMadness" /> Prediction Madness</label>
        </div>
        <div className="md:col-span-2">
          <Button variant="glow" disabled={pending}>{pending ? "Creating…" : "Create match"}</Button>
        </div>
      </form>
    </Card>
  );
}
