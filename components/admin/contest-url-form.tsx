"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { updateContestUrlAction } from "@/actions/admin";

export function ContestUrlForm({
  matchId,
  initial,
}: {
  matchId: string;
  initial?: string;
}) {
  const [url, setUrl] = useState(initial ?? "");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await updateContestUrlAction({ matchId, contestUrl: url.trim() });
      if (r.ok) toast.success(url.trim() ? "Contest link saved" : "Contest link removed");
      else toast.error(r.error);
    });

  return (
    <Card>
      <h2 className="font-semibold mb-1">🔗 Contest Link</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Paste the Dream11 (or any) contest URL. Players will see a button to join from the match page.
      </p>
      <div className="space-y-2">
        <Label htmlFor="contestUrl">Contest URL</Label>
        <Input
          id="contestUrl"
          type="url"
          placeholder="https://dream11.com/contest/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="flex gap-2">
          <Button variant="glow" onClick={save} loading={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {initial && (
            <Button
              variant="outline"
              onClick={() => {
                setUrl("");
                start(async () => {
                  const r = await updateContestUrlAction({ matchId, contestUrl: "" });
                  if (r.ok) toast.success("Contest link removed");
                  else toast.error(r.error);
                });
              }}
              disabled={pending}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
