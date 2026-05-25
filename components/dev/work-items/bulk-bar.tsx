/**
 * Sticky bottom bar that appears when ≥1 item is selected. Provides bulk
 * status / priority / assign changes and delete. All operations call
 * `bulkUpdateWorkItemsAction` which is capped at 100 ids server-side.
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkUpdateWorkItemsAction } from "@/actions/work-items";
import { STATUS_META, STATUS_ORDER, PRIORITY_META, PRIORITY_ORDER } from "./util";
import type { Priority, Status, WorkItemAssignee } from "./types";

export function BulkBar({
  selectedIds,
  assignees,
  onClear,
}: {
  selectedIds: string[];
  assignees: WorkItemAssignee[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  type BulkPayload = {
    ids: string[];
    action: "status" | "priority" | "assign" | "delete";
    status?: Status;
    priority?: Priority;
    assignedToId?: string;
  };

  const run = (key: string, action: BulkPayload) => {
    setBusyKey(key);
    start(async () => {
      const res = await bulkUpdateWorkItemsAction(action);
      setBusyKey(null);
      if (!res || res.ok === false) {
        toast.error(res?.error ?? "Bulk update failed");
        return;
      }
      const n = (res as { count?: number }).count ?? selectedIds.length;
      toast.success(`${n} item${n === 1 ? "" : "s"} updated`);
      onClear();
      router.refresh();
    });
  };

  if (selectedIds.length === 0) return null;

  return (
    <div className="fixed inset-x-2 bottom-2 z-40 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/95 px-3 py-2 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
          {selectedIds.length} selected
        </span>

        {/* Status */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/50 p-0.5">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                run(`status:${s}`, {
                  ids: selectedIds,
                  action: "status",
                  status: s as Status,
                })
              }
              disabled={pending}
              className={
                "rounded-md px-2 py-1 text-[10px] font-semibold hover:bg-muted/40 " +
                (busyKey === `status:${s}` ? "opacity-50" : "")
              }
              title={`Set status to ${STATUS_META[s].label}`}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>

        {/* Priority */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/50 p-0.5">
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() =>
                run(`pri:${p}`, {
                  ids: selectedIds,
                  action: "priority",
                  priority: p as Priority,
                })
              }
              disabled={pending}
              className={
                "rounded-md px-2 py-1 text-[10px] font-semibold hover:bg-muted/40 " +
                (busyKey === `pri:${p}` ? "opacity-50" : "")
              }
              title={`Set priority to ${PRIORITY_META[p].label}`}
            >
              {PRIORITY_META[p].label}
            </button>
          ))}
        </div>

        {/* Assign */}
        <select
          disabled={pending}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            run(`assign:${v}`, {
              ids: selectedIds,
              action: "assign",
              assignedToId: v,
            });
          }}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-[11px]"
        >
          <option value="">Assign…</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {/* Delete */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete ${selectedIds.length} work item(s)?`)) return;
            run("delete", { ids: selectedIds, action: "delete" });
          }}
          className="text-danger hover:text-danger"
        >
          {busyKey === "delete" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>

        <button
          type="button"
          onClick={onClear}
          className="grid h-7 w-7 place-items-center rounded-lg hover:bg-muted/40"
          aria-label="Clear selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
