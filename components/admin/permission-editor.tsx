"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  FEATURE_DEFS,
  FEATURE_GROUPS,
  type FeatureDef,
  type FeatureGroup,
  type FeatureKey,
} from "@/lib/features";
import { toggleUserFeatureAction } from "@/actions/admin";

export type EditorUser = {
  id: string;
  username: string;
  handle: string;
  role: "user" | "admin" | "superadmin";
  customRoleName: string | null;
  /** Features granted directly to the user. */
  directFeatures: FeatureKey[];
  /** Features inherited from the user's custom role (read-only here). */
  roleFeatures: FeatureKey[];
};

type SortKey = "name" | "permissions" | "role";

const GROUP_BLURB: Record<FeatureGroup, string> = {
  Matches: "Fixture lifecycle and lock windows.",
  Results: "Submit and edit official scoring.",
  Bonuses: "Tune bonus point values and rules.",
  "Civil War": "Battle settings and overrides.",
  Users: "Account, role and approval workflows.",
  Audit: "Read-only access to history.",
  Tools: "Maintenance and automations.",
  Content: "Narratives and AI-generated content.",
  Developer: "Dev workspace: bugs, work items, diagnostics.",
};

export function PermissionEditor({
  users,
  selfId,
}: {
  users: EditorUser[];
  selfId: string;
}) {
  const [rows, setRows] = useState(users);
  const initialId =
    rows.find((u) => u.id !== selfId && u.role !== "superadmin")?.id ??
    rows[0]?.id ??
    null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [, start] = useTransition();
  const [busyFeature, setBusyFeature] = useState<FeatureKey | null>(null);

  const featuresByGroup = useMemo(() => {
    const out: { group: FeatureGroup; features: FeatureDef[] }[] = [];
    for (const g of FEATURE_GROUPS) {
      const fs = (FEATURE_DEFS as readonly FeatureDef[]).filter(
        (f) => f.group === g,
      );
      if (fs.length) out.push({ group: g, features: fs });
    }
    return out;
  }, []);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          r.username.toLowerCase().includes(q) ||
          r.handle.toLowerCase().includes(q) ||
          (r.customRoleName ?? "").toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    if (sort === "name") {
      sorted.sort((a, b) => a.username.localeCompare(b.username));
    } else if (sort === "permissions") {
      sorted.sort((a, b) => {
        const ca = a.role === "superadmin" ? 99 : effectiveCount(a);
        const cb = b.role === "superadmin" ? 99 : effectiveCount(b);
        return cb - ca;
      });
    } else {
      sorted.sort((a, b) => {
        const ra = roleRank(a);
        const rb = roleRank(b);
        if (ra !== rb) return ra - rb;
        return a.username.localeCompare(b.username);
      });
    }
    return sorted;
  }, [rows, search, sort]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  function toggle(user: EditorUser, feature: FeatureKey, enabled: boolean) {
    if (user.role === "superadmin") {
      toast.info("Superadmin already has every feature");
      return;
    }
    if (user.id === selfId) {
      toast.error("You can't edit your own permissions");
      return;
    }
    // Optimistic.
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== user.id) return r;
        const set = new Set(r.directFeatures);
        if (enabled) set.add(feature);
        else set.delete(feature);
        return { ...r, directFeatures: Array.from(set) };
      }),
    );
    setBusyFeature(feature);
    start(async () => {
      const res = await toggleUserFeatureAction({
        targetUserId: user.id,
        feature,
        enabled,
      });
      setBusyFeature(null);
      if (!res.ok) {
        toast.error(res.error || "Update failed");
        setRows((prev) =>
          prev.map((r) => {
            if (r.id !== user.id) return r;
            const set = new Set(r.directFeatures);
            if (enabled) set.delete(feature);
            else set.add(feature);
            return { ...r, directFeatures: Array.from(set) };
          }),
        );
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === user.id
            ? { ...r, directFeatures: (res.features ?? []) as FeatureKey[] }
            : r,
        ),
      );
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      {/* Left: user list */}
      <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col rounded-xl border border-border/60 bg-card/40">
        <div className="p-3 border-b border-border/60 space-y-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="h-9 w-full rounded-md border border-border/70 bg-background px-3 text-sm"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {visibleRows.length} of {rows.length}
            </span>
            <label className="flex items-center gap-1.5">
              <span>Sort:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-7 rounded border border-border/70 bg-background px-1.5 text-[11px]"
              >
                <option value="name">Name</option>
                <option value="permissions">Permissions</option>
                <option value="role">Role</option>
              </select>
            </label>
          </div>
        </div>
        <ul className="overflow-y-auto flex-1 p-1.5 space-y-1">
          {visibleRows.map((u) => {
            const active = u.id === selectedId;
            const count =
              u.role === "superadmin" ? FEATURE_DEFS.length : effectiveCount(u);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(u.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 transition ${
                    active
                      ? "bg-primary/15 ring-1 ring-primary/40"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {u.username}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        @{u.handle}
                      </div>
                    </div>
                    <RoleChip user={u} self={u.id === selfId} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <CountPill
                      count={count}
                      total={FEATURE_DEFS.length}
                      max={u.role === "superadmin"}
                    />
                    {u.customRoleName ? (
                      <span className="truncate">via {u.customRoleName}</span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right: editor */}
      <section className="min-w-0">
        {!selected ? (
          <EmptyState />
        ) : (
          <UserDetail
            key={selected.id}
            user={selected}
            groups={featuresByGroup}
            self={selected.id === selfId}
            busyFeature={busyFeature}
            onToggle={(f, v) => toggle(selected, f, v)}
          />
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function effectiveCount(u: EditorUser): number {
  const set = new Set<FeatureKey>([...u.directFeatures, ...u.roleFeatures]);
  return set.size;
}

function roleRank(u: EditorUser): number {
  if (u.role === "superadmin") return 0;
  if (u.customRoleName) return 1;
  return 2;
}

function RoleChip({ user, self }: { user: EditorUser; self: boolean }) {
  if (user.role === "superadmin") {
    return (
      <span className="rounded-full bg-amber-500/15 text-amber-300 px-1.5 py-0.5 text-[9px] uppercase tracking-wider shrink-0">
        super
      </span>
    );
  }
  if (user.customRoleName) {
    return (
      <span className="rounded-full bg-blue-500/15 text-blue-300 px-1.5 py-0.5 text-[9px] shrink-0 truncate max-w-[110px]">
        {user.customRoleName}
      </span>
    );
  }
  if (self) {
    return (
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
        you
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
      user
    </span>
  );
}

function CountPill({
  count,
  total,
  max,
}: {
  count: number;
  total: number;
  max: boolean;
}) {
  if (max) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
        ★ all features
      </span>
    );
  }
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-1.5 py-0.5">
        no permissions
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
      {count}/{total} features
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex h-[60vh] items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/20 text-sm text-muted-foreground">
      Select a user from the left to manage their permissions.
    </div>
  );
}

function UserDetail({
  user,
  groups,
  self,
  busyFeature,
  onToggle,
}: {
  user: EditorUser;
  groups: { group: FeatureGroup; features: FeatureDef[] }[];
  self: boolean;
  busyFeature: FeatureKey | null;
  onToggle: (feature: FeatureKey, enabled: boolean) => void;
}) {
  const directSet = new Set(user.directFeatures);
  const roleSet = new Set(user.roleFeatures);
  const isSuper = user.role === "superadmin";
  const lockedReason = isSuper
    ? "Superadmin always has every feature."
    : self
      ? "You can't edit your own permissions."
      : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold">{user.username}</h3>
            <div className="text-xs text-muted-foreground">
              @{user.handle}
              {user.customRoleName ? (
                <>
                  {" · "}
                  Role:{" "}
                  <a href="/admin/users" className="underline">
                    {user.customRoleName}
                  </a>
                </>
              ) : null}
            </div>
          </div>
          <RoleChip user={user} self={self} />
        </div>
        {lockedReason ? (
          <div className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {lockedReason}
          </div>
        ) : null}
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {groups.map(({ group, features }) => {
          const groupOn = features.filter(
            (f) =>
              isSuper ||
              directSet.has(f.key as FeatureKey) ||
              roleSet.has(f.key as FeatureKey),
          ).length;
          return (
            <div
              key={group}
              className="rounded-xl border border-border/60 bg-card/40 overflow-hidden"
            >
              <header className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{group}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {GROUP_BLURB[group]}
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {isSuper ? features.length : groupOn} / {features.length}
                </span>
              </header>
              <ul className="divide-y divide-border/40">
                {features.map((f) => {
                  const key = f.key as FeatureKey;
                  const fromRole = roleSet.has(key);
                  const direct = directSet.has(key);
                  const checked = isSuper || direct || fromRole;
                  const lockedByRole = !direct && fromRole && !isSuper;
                  const disabled =
                    isSuper || self || lockedByRole || busyFeature === key;
                  return (
                    <li
                      key={key}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                        busyFeature === key ? "bg-muted/20" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {f.label}
                          </span>
                          {f.sensitive ? (
                            <span className="rounded bg-amber-500/15 text-amber-300 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
                              sensitive
                            </span>
                          ) : null}
                          {lockedByRole ? (
                            <span className="rounded bg-blue-500/15 text-blue-300 px-1.5 py-0.5 text-[9px]">
                              from role
                            </span>
                          ) : direct && !isSuper ? (
                            <span className="rounded bg-emerald-500/15 text-emerald-300 px-1.5 py-0.5 text-[9px]">
                              direct
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {f.description}
                        </div>
                      </div>
                      <Switch
                        checked={checked}
                        disabled={disabled}
                        onChange={(v) => onToggle(key, v)}
                      />
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

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-150 ${
        checked ? "bg-emerald-500/80" : "bg-muted"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:brightness-110"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-150 ${
          checked ? "translate-x-5" : "translate-x-0.5"
        } translate-y-0.5`}
      />
    </button>
  );
}
