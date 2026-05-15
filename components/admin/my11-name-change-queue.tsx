"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  adminApproveMy11NameAction,
  adminDenyMy11NameAction,
} from "@/actions/my11-name";

export type My11NameRequestRow = {
  userId: string;
  username: string;
  handle: string;
  currentMy11Name: string | null;
  requested: string;
  requestedAt: string;
};

export function My11NameChangeQueue({ rows }: { rows: My11NameRequestRow[] }) {
  const [pending, start] = useTransition();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"approve" | "deny" | null>(null);
  const [denyReasonFor, setDenyReasonFor] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  const approve = (userId: string) =>
    start(async () => {
      setActiveUserId(userId);
      setActiveAction("approve");
      try {
        const r = await adminApproveMy11NameAction(userId);
        if (!r.ok) throw new Error(r.error);
        toast.success("Approved — user can now verify & save");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      } finally {
        setActiveUserId(null);
        setActiveAction(null);
      }
    });

  const deny = (userId: string, reason: string) =>
    start(async () => {
      setActiveUserId(userId);
      setActiveAction("deny");
      try {
        const r = await adminDenyMy11NameAction(userId, reason);
        if (!r.ok) throw new Error(r.error);
        toast.success("Denied");
        setDenyReasonFor(null);
        setDenyReason("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      } finally {
        setActiveUserId(null);
        setActiveAction(null);
      }
    });

  return (
    <Card className="border-border/70">
      <h2 className="font-semibold mb-2">My11Circle Name Change Approvals</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Approve to let the user run the verification check and save. Approved
        users still must pass a leaderboard match check before the name is
        actually stored.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending name-change requests.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.userId}
              className="rounded-xl border border-border/70 bg-card p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {row.username}{" "}
                    <span className="text-xs text-muted-foreground">@{row.handle}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Current:</span>{" "}
                    <span className="font-mono">
                      {row.currentMy11Name || "—"}
                    </span>
                    <span className="text-muted-foreground"> → Requested:</span>{" "}
                    <span className="font-mono text-foreground">{row.requested}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(row.requestedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap shrink-0">
                  <Button
                    className="min-w-[98px]"
                    size="sm"
                    onClick={() => approve(row.userId)}
                    loading={pending && activeUserId === row.userId && activeAction === "approve"}
                    disabled={pending}
                  >
                    Approve
                  </Button>
                  <Button
                    className="min-w-[98px]"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDenyReasonFor(row.userId);
                      setDenyReason("");
                    }}
                    disabled={pending}
                  >
                    Deny
                  </Button>
                </div>
              </div>

              {denyReasonFor === row.userId && (
                <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                  <textarea
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="Optional reason shown to user"
                    rows={2}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDenyReasonFor(null);
                        setDenyReason("");
                      }}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => deny(row.userId, denyReason)}
                      loading={pending && activeUserId === row.userId && activeAction === "deny"}
                      disabled={pending}
                    >
                      Confirm deny
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
