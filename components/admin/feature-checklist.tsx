"use client";

import { useMemo, useState } from "react";
import {
  FEATURE_BY_KEY,
  featuresByGroup,
  type FeatureKey,
  type FeatureGroup,
} from "@/lib/features";

const GROUPS_ORDER: FeatureGroup[] = [
  "Matches",
  "Results",
  "Bonuses",
  "Civil War",
  "Users",
  "Tools",
  "Content",
  "Developer",
  "Integrations",
];

const GROUP_HINTS: Record<FeatureGroup, string> = {
  Matches: "Fixture creation, lock windows, modes",
  Results: "Entering scoring & ranks",
  Bonuses: "Custom & system bonus rules",
  "Civil War": "Team-battle scoring",
  Users: "Role assignment, deletion, approvals",
  Tools: "Automations & backfills",
  Content: "AI storylines & narrative",
  Developer: "Bugs, work items, audit log, diagnostics",
  Integrations: "My11Circle session capture and other external integrations",
};

export function FeatureChecklist({
  selected,
  onChange,
  disabled,
  lockedAllChecked,
  lockedHint,
}: {
  selected: FeatureKey[];
  onChange: (next: FeatureKey[]) => void;
  disabled?: boolean;
  /** If true, render every box as checked + disabled (e.g. superadmin). */
  lockedAllChecked?: boolean;
  lockedHint?: string;
}) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => featuresByGroup(), []);
  const set = useMemo(() => new Set(selected), [selected]);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);

  const toggle = (k: FeatureKey) => {
    if (disabled || lockedAllChecked) return;
    onChange(set.has(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  };

  const setGroup = (group: FeatureGroup, on: boolean) => {
    if (disabled || lockedAllChecked) return;
    const groupKeys = (grouped[group] ?? []).map((f) => f.key as FeatureKey);
    const next = new Set(selected);
    for (const k of groupKeys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(Array.from(next));
  };

  const totalSelected = lockedAllChecked
    ? Object.keys(FEATURE_BY_KEY).length
    : selected.length;
  const total = Object.keys(FEATURE_BY_KEY).length;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{totalSelected}</span>
          {" / "}
          {total} features enabled
          {lockedHint && (
            <span className="ml-2 text-[10px] rounded-full bg-muted px-2 py-0.5">
              {lockedHint}
            </span>
          )}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search features…"
          className="h-9 rounded-lg border border-border bg-card px-2.5 text-sm w-full sm:w-56"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        {GROUPS_ORDER.map((group) => {
          const defs = (grouped[group] ?? []).filter(
            (f) => matches(f.label) || matches(f.description) || matches(f.key),
          );
          if (defs.length === 0) return null;
          const groupKeys = defs.map((d) => d.key as FeatureKey);
          const selectedInGroup = lockedAllChecked
            ? groupKeys.length
            : groupKeys.filter((k) => set.has(k)).length;
          const allOn = selectedInGroup === groupKeys.length;
          const noneOn = selectedInGroup === 0;

          return (
            <div
              key={group}
              className="rounded-xl border border-border/60 bg-card/60 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/30 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold tracking-wide flex items-center gap-2">
                    {group}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {selectedInGroup}/{groupKeys.length}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {GROUP_HINTS[group]}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setGroup(group, true)}
                    disabled={disabled || lockedAllChecked || allOn}
                    className="text-[10px] rounded-md border border-border bg-card px-2 py-1 hover:bg-muted/50 disabled:opacity-40"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroup(group, false)}
                    disabled={disabled || lockedAllChecked || noneOn}
                    className="text-[10px] rounded-md border border-border bg-card px-2 py-1 hover:bg-muted/50 disabled:opacity-40"
                  >
                    None
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-border/40">
                {defs.map((def) => {
                  const k = def.key as FeatureKey;
                  const isOn = lockedAllChecked || set.has(k);
                  return (
                    <li key={k}>
                      <label
                        className={
                          "flex gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 " +
                          (disabled || lockedAllChecked ? "cursor-not-allowed" : "")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggle(k)}
                          disabled={disabled || lockedAllChecked}
                          className="mt-0.5 size-4 accent-primary shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{def.label}</span>
                            {def.sensitive && (
                              <span className="text-[9px] uppercase tracking-wider rounded bg-warning/20 text-warning px-1.5 py-0.5">
                                sensitive
                              </span>
                            )}
                            <code className="text-[10px] text-muted-foreground/80 font-mono">
                              {def.key}
                            </code>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {def.description}
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
