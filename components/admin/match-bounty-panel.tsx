"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  const [reason, setReason] = useState(initialReason ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedUsers;
    return sortedUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q)
    );
  }, [sortedUsers, query]);

  const selectedUser = sortedUsers.find((user) => user.id === selected);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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
        <Label htmlFor="bountySelect">Bounty holder</Label>
        <div ref={wrapperRef} className="relative">
          <button
            id="bountySelect"
            type="button"
            onClick={() => setOpen((state) => !state)}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-left flex items-center justify-between"
          >
            <span className={selectedUser ? "text-foreground" : "text-muted-foreground"}>
              {selectedUser ? `${selectedUser.name} (@${selectedUser.handle})` : "— No bounty for this match —"}
            </span>
            <span className="text-muted-foreground">▾</span>
          </button>

          {open ? (
            <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card p-2 shadow-xl space-y-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search player"
                className="h-9"
                autoFocus
              />
              <div className="max-h-52 overflow-auto space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelected("");
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full text-left rounded-lg px-2 py-1.5 text-sm transition ${
                    !selected ? "bg-primary/15 text-primary" : "hover:bg-muted"
                  }`}
                >
                  — No bounty for this match —
                </button>
                {filteredUsers.length ? (
                  filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelected(user.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`w-full text-left rounded-lg px-2 py-1.5 text-sm transition ${
                        selected === user.id ? "bg-primary/15 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      {user.name} (@{user.handle})
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No players found.</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
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
