"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateMatchBountyAction } from "@/actions/admin";

type UserOpt = {
  id: string;
  name: string;
  handle: string;
};

export function MatchBountyPanel({
  matchId,
  users,
  initialBountyUserId,
  initialReason,
}: {
  matchId: string;
  users: UserOpt[];
  initialBountyUserId?: string;
  initialReason?: string;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(initialBountyUserId ?? "");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState(initialReason ?? "");

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedUsers;
    return sortedUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q)
    );
  }, [sortedUsers, search]);

  const save = () =>
    start(async () => {
      const r = await updateMatchBountyAction({
        matchId,
        bountyUserId: selected || null,
        bountyReason: reason,
      });
      if (r.ok) {
        toast.success(selected ? "Match bounty updated" : "Match bounty cleared");
      } else {
        toast.error(r.error ?? "Failed to save bounty");
      }
    });

  return (
    <Card>
      <h2 className="font-semibold mb-2">🎯 Match Bounty</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Select a bounty holder only for this match. Leave empty for no bounty.
      </p>

      <div className="space-y-2 mt-3">
        <Label htmlFor="bountySearch">Search player</Label>
        <Input
          id="bountySearch"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type name or handle"
        />
      </div>

      <div className="space-y-2 mt-3">
        <Label htmlFor="bountySelect">Bounty holder</Label>
        <select
          id="bountySelect"
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— No bounty for this match —</option>
          {filteredUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} (@{u.handle})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 mt-3">
        <Label htmlFor="bountyReason">Reason (shown to all players)</Label>
        <Input
          id="bountyReason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Defending champion, giant-killer streak"
          maxLength={200}
        />
      </div>

      <div className="mt-4">
        <Button variant="glow" onClick={save} loading={pending}>
          {pending ? "Saving..." : "Save bounty"}
        </Button>
      </div>
    </Card>
  );
}
