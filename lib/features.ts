// Centralised catalogue of fine-grained permissions ("features") the admin
// can hand out à la carte. Adding a new feature is a 3-step process:
//   1) add the key to `FEATURE_DEFS` below
//   2) gate the relevant UI with `userHasFeature(me, "<key>")`
//   3) gate the relevant server action with `requireAdminFeature("<key>")`

export type FeatureGroup =
  | "Matches"
  | "Results"
  | "Bonuses"
  | "Civil War"
  | "Users"
  | "Audit"
  | "Tools"
  | "Content"
  | "Developer";

export type FeatureDef = {
  key: string;
  label: string;
  description: string;
  group: FeatureGroup;
  /** Marks features that can mutate scoring or delete data; the UI flags them. */
  sensitive?: boolean;
  /**
   * Feature retired — keep the slot to preserve bit positions, but hide from
   * admin UI and ignore in access checks where it's been replaced. Existing
   * grants stay readable so audit history makes sense.
   */
  retired?: boolean;
};

export const FEATURE_DEFS = [
  {
    key: "matches.manage",
    label: "Manage matches",
    description:
      "Create / sync fixtures, edit chaos / double-points modes, contest URL, custom pools.",
    group: "Matches",
  },
  {
    key: "match.lock.extend",
    label: "Extend lock windows",
    description: "Push back prediction / rivalry lock deadlines for a specific match.",
    group: "Matches",
  },
  {
    key: "results.manage",
    label: "Enter & edit results",
    description:
      "Submit fantasy points, ranks and prediction answers. This drives the leaderboard.",
    group: "Results",
    sensitive: true,
  },
  {
    key: "bonus.manage",
    label: "Manage bonus rules",
    description: "Change bonus point values and create / disable custom bonuses.",
    group: "Bonuses",
    sensitive: true,
  },
  {
    key: "civilwar.points.manage",
    label: "Edit Civil War scoring",
    description: "Change decisive / split win + loss values for team battles.",
    group: "Civil War",
    sensitive: true,
  },
  {
    key: "users.manage",
    label: "Approve user requests",
    description: "Review and approve My11Circle name change requests.",
    group: "Users",
  },
  {
    key: "users.roles.assign",
    label: "Assign roles",
    description: "Pick a system or custom role for any user.",
    group: "Users",
    sensitive: true,
  },
  {
    key: "users.delete",
    label: "Delete users",
    description:
      "Permanently remove a user and all their predictions / rivalries / results.",
    group: "Users",
    sensitive: true,
  },
  {
    key: "rivalry.withdraw.approve",
    label: "Approve rivalry withdrawals",
    description: "Decide whether a player can back out of an accepted rivalry.",
    group: "Users",
  },
  {
    key: "audit.view",
    label: "View audit log",
    description: "Read-only access to the full action history.",
    group: "Audit",
  },
  {
    key: "automation.run",
    label: "Run automations",
    description:
      "Refresh match statuses, force-complete matches, run scoring back-fills.",
    group: "Tools",
  },
  {
    key: "facts.regenerate",
    label: "Regenerate storylines",
    description: "Re-run the AI narrator for the latest scored match.",
    group: "Content",
  },
  {
    key: "bugs.view",
    label: "View bug reports",
    description:
      "Retired — replaced by ‘Developer member’. Grants are kept readable for audit history.",
    group: "Developer",
    retired: true,
  },
  {
    key: "bugs.manage",
    label: "Manage bug reports",
    description:
      "Assign bugs to others, change status, accept/reopen submissions, delete reports. Lets a developer act on any bug, not just ones assigned to them.",
    group: "Developer",
    sensitive: true,
  },
  {
    key: "match.bounty.manage",
    label: "Set match bounty",
    description:
      "Pick or clear the bounty target (and reason) for individual matches.",
    group: "Matches",
  },
  {
    key: "dev.workitems.view",
    label: "View work items",
    description:
      "Retired — replaced by ‘Developer member’. Grants are kept readable for audit history.",
    group: "Developer",
    retired: true,
  },
  {
    key: "dev.workitems.manage",
    label: "Manage work items",
    description:
      "Assign work items to others, change status, accept/reopen submissions, delete items. Lets a developer act on any work item, not just ones assigned to them.",
    group: "Developer",
    sensitive: true,
  },
  {
    key: "dev.diagnostics.view",
    label: "View diagnostics",
    description:
      "Runtime metrics: memory usage, uptime, DB counts, recent activity graph.",
    group: "Developer",
  },
  {
    key: "dev.member",
    label: "Developer",
    description:
      "Eligible to be assigned bugs and work items. Sees all reported bugs and work items, can comment freely, but can only act on items assigned to them.",
    group: "Developer",
  },
] as const satisfies readonly FeatureDef[];

export type FeatureKey = (typeof FEATURE_DEFS)[number]["key"];

export const FEATURE_KEYS = FEATURE_DEFS.map((f) => f.key) as readonly FeatureKey[];

// Stable bit positions: each feature's index in FEATURE_DEFS is its bit position.
// CRITICAL: never reorder or remove entries — only append. Removing a feature
// would shift every later bit and corrupt stored bitmaps. To retire one,
// keep its slot and add a `retired: true` flag (then ignore it in UI).
export const FEATURE_BITS = Object.fromEntries(
  FEATURE_DEFS.map((f, i) => [f.key, i]),
) as Record<FeatureKey, number>;

export const FEATURE_LABELS = Object.fromEntries(
  FEATURE_DEFS.map((f) => [f.key, f.label]),
) as Record<FeatureKey, string>;

export const FEATURE_BY_KEY = Object.fromEntries(
  FEATURE_DEFS.map((f) => [f.key, f]),
) as Record<FeatureKey, FeatureDef>;

export const FEATURE_GROUPS: FeatureGroup[] = [
  "Matches",
  "Results",
  "Bonuses",
  "Civil War",
  "Users",
  "Audit",
  "Tools",
  "Content",
  "Developer",
];

export function featuresByGroup(): Record<FeatureGroup, FeatureDef[]> {
  const out = Object.fromEntries(
    FEATURE_GROUPS.map((g) => [g, [] as FeatureDef[]]),
  ) as Record<FeatureGroup, FeatureDef[]>;
  for (const f of FEATURE_DEFS) {
    if ((f as FeatureDef).retired) continue; // hide retired features from admin UIs
    out[f.group].push(f);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bitmap encoding — permissions are stored as a BigInt rendered as a decimal
// string in Mongo (`User.permissionBitmap`, `Role.permissionBitmap`). This
// gives us:
//   - O(1) "has feature X" checks (single bitwise AND)
//   - compact storage (15 features today fits in a 4-character string)
//   - unlimited future growth (BigInt has no width limit)
// All helpers tolerate `null` / `undefined` / "" as the empty bitmap.
// ---------------------------------------------------------------------------

export const EMPTY_BITMAP = "0";

export function keysToBitmap(keys: readonly FeatureKey[] | null | undefined): string {
  if (!keys || keys.length === 0) return EMPTY_BITMAP;
  let mask = 0n;
  for (const k of keys) {
    const bit = FEATURE_BITS[k];
    if (typeof bit !== "number") continue;
    mask |= 1n << BigInt(bit);
  }
  return mask.toString();
}

export function bitmapToKeys(bitmap: string | null | undefined): FeatureKey[] {
  const mask = parseBitmap(bitmap);
  if (mask === 0n) return [];
  const out: FeatureKey[] = [];
  for (const f of FEATURE_DEFS) {
    const bit = FEATURE_BITS[f.key];
    if ((mask & (1n << BigInt(bit))) !== 0n) out.push(f.key);
  }
  return out;
}

export function bitmapHas(bitmap: string | null | undefined, key: FeatureKey): boolean {
  const bit = FEATURE_BITS[key];
  if (typeof bit !== "number") return false;
  return (parseBitmap(bitmap) & (1n << BigInt(bit))) !== 0n;
}

export function bitmapOr(...bitmaps: Array<string | null | undefined>): string {
  let out = 0n;
  for (const b of bitmaps) out |= parseBitmap(b);
  return out.toString();
}

export function bitmapDiff(prev: string | null | undefined, next: string | null | undefined) {
  const p = parseBitmap(prev);
  const n = parseBitmap(next);
  const added = bitmapToKeys((n & ~p).toString());
  const removed = bitmapToKeys((p & ~n).toString());
  return { added, removed };
}

function parseBitmap(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}