"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FEATURE_BY_KEY, FEATURE_GROUPS, FEATURE_LABELS, type FeatureGroup, type FeatureKey } from "@/lib/features";
import { FeatureChecklist } from "@/components/admin/feature-checklist";
import {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
} from "@/actions/admin";

export type CustomRoleRow = {
  id: string;
  name: string;
  features: FeatureKey[];
  usageCount: number;
};

export function RolesEditor({ initial }: { initial: CustomRoleRow[] }) {
  const [roles, setRoles] = useState(initial);
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftFeatures, setDraftFeatures] = useState<FeatureKey[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFeatures, setEditFeatures] = useState<FeatureKey[]>([]);

  const toggleDraft = (next: FeatureKey[]) => setDraftFeatures(next);
  const toggleEdit = (next: FeatureKey[]) => setEditFeatures(next);

  const startEdit = (r: CustomRoleRow) => {
    setEditingId(r.id);
    setEditName(r.name);
    setEditFeatures(r.features);
  };

  const submitCreate = () => {
    const name = draftName.trim();
    if (!name) {
      toast.error("Role name is required");
      return;
    }
    if (draftFeatures.length === 0) {
      toast.error("Pick at least one feature for this role");
      return;
    }
    start(async () => {
      const res = await createRoleAction({ name, features: draftFeatures });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to create role");
        return;
      }
      toast.success(`Role "${name}" created`);
      setRoles((p) => [
        ...p,
        { id: res.id, name, features: draftFeatures, usageCount: 0 },
      ]);
      setCreating(false);
      setDraftName("");
      setDraftFeatures([]);
    });
  };

  const submitEdit = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Role name is required");
      return;
    }
    if (editFeatures.length === 0) {
      toast.error("Pick at least one feature for this role");
      return;
    }
    start(async () => {
      const res = await updateRoleAction({ id: editingId, name, features: editFeatures });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to update role");
        return;
      }
      toast.success("Role updated");
      setRoles((p) =>
        p.map((r) => (r.id === editingId ? { ...r, name, features: editFeatures } : r))
      );
      setEditingId(null);
    });
  };

  const submitDelete = (r: CustomRoleRow) => {
    if (r.usageCount > 0) {
      toast.error(`Cannot delete — ${r.usageCount} user${r.usageCount === 1 ? "" : "s"} still mapped.`);
      return;
    }
    if (!confirm(`Delete role "${r.name}"? This cannot be undone.`)) return;
    start(async () => {
      const res = await deleteRoleAction({ id: r.id });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to delete role");
        return;
      }
      toast.success(`Role "${r.name}" deleted`);
      setRoles((p) => p.filter((x) => x.id !== r.id));
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Custom roles</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Define named permission sets. Assign them from the role dropdown next to each user.
          </p>
        </div>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} disabled={pending}>
            + New role
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">Role name</label>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Match Operator"
              className="mt-1 w-full h-9 rounded-lg border border-border bg-card px-2 text-sm"
              disabled={pending}
            />
          </div>
          <FeatureChecklist selected={draftFeatures} onChange={toggleDraft} disabled={pending} />
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={submitCreate}>
              Create role
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreating(false);
                setDraftName("");
                setDraftFeatures([]);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {roles.length === 0 && !creating && (
        <p className="text-xs text-muted-foreground">No custom roles yet.</p>
      )}

      <div className="space-y-2">
        {roles.map((r) => {
          const isEditing = editingId === r.id;
          return (
            <div
              key={r.id}
              className="rounded-lg border border-border/70 bg-card p-3 space-y-2"
            >
              {!isEditing ? (
                <>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-medium text-sm">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.usageCount} user{r.usageCount === 1 ? "" : "s"} mapped ·{" "}
                        {r.features.length} feature{r.features.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(r)} disabled={pending}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => submitDelete(r)}
                        disabled={pending || r.usageCount > 0}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {r.features.length > 0 && (
                    <GroupedFeaturePills features={r.features} />
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-card px-2 text-sm"
                    disabled={pending}
                  />
                  <FeatureChecklist selected={editFeatures} onChange={toggleEdit} disabled={pending} />
                  <div className="flex gap-2">
                    <Button size="sm" loading={pending} onClick={submitEdit}>
                      Save changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FeatureChecklistLegacy_REMOVED() {
  return null;
}

const GROUP_TONES: Record<FeatureGroup, string> = {
  Matches: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Results: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  Bonuses: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "Civil War": "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  Users: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Tools: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  Content: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  Developer: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
};

function GroupedFeaturePills({ features }: { features: FeatureKey[] }) {
  const set = new Set(features);
  const byGroup = FEATURE_GROUPS.map((g) => ({
    group: g,
    keys: features.filter((k) => FEATURE_BY_KEY[k]?.group === g && set.has(k)),
  })).filter((x) => x.keys.length > 0);

  if (byGroup.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {byGroup.map(({ group, keys }) => (
        <div key={group} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
            {group}
          </span>
          <div className="flex flex-wrap gap-1">
            {keys.map((f) => (
              <span
                key={f}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${GROUP_TONES[FEATURE_BY_KEY[f]!.group]}`}
              >
                {FEATURE_LABELS[f]}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

