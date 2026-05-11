"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { adminResolveRivalryWithdrawalAction } from "@/actions/rivalry";

type Row = {
  rivalryId: string;
  matchLabel: string;
  challenger: string;
  opponent: string;
  requestedBy: string;
  requestedAt: string;
  status: string;
};

export function RivalryWithdrawalQueue({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();

  const resolve = (rivalryId: string, approve: boolean) =>
    start(async () => {
      try {
        const res = await adminResolveRivalryWithdrawalAction({ rivalryId, approve });
        if (!res.ok) throw new Error(res.error);
        toast.success(approve ? "Withdrawal approved" : "Withdrawal denied");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Request failed");
      }
    });

  return (
    <Card>
      <h2 className="font-semibold mb-2">⚔️ Rivalry withdrawal requests</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Requests here can be approved without the −2 penalty. All active challenges in that match
        are withdrawn when approved.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending withdrawal requests.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.rivalryId} className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-medium break-words">{row.matchLabel}</div>
                  <div className="text-xs text-muted-foreground break-words">
                    {row.challenger} vs {row.opponent}
                  </div>
                  <div className="text-xs text-muted-foreground break-words">
                    Requested by {row.requestedBy} · {new Date(row.requestedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => resolve(row.rivalryId, true)}
                    loading={pending}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolve(row.rivalryId, false)}
                    loading={pending}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}