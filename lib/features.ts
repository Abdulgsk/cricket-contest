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
  | "Content";

export type FeatureDef = {
  key: string;
  label: string;
  description: string;
  group: FeatureGroup;
  /** Marks features that can mutate scoring or delete data; the UI flags them. */
  sensitive?: boolean;
};

export const FEATURE_DEFS = [
  {
    key: "matches.manage",
    label: "Manage matches",
    description:
      "Create / sync fixtures, edit chaos / double-points modes, contest URL, bounty, custom pools.",
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
    description: "See bug reports submitted by users in the admin console.",
    group: "Users",
  },
  {
    key: "bugs.manage",
    label: "Manage bug reports",
    description:
      "Change status (in progress / resolved / won't fix), add internal notes and delete reports.",
    group: "Users",
    sensitive: true,
  },
] as const satisfies readonly FeatureDef[];

export type FeatureKey = (typeof FEATURE_DEFS)[number]["key"];

export const FEATURE_KEYS = FEATURE_DEFS.map((f) => f.key) as readonly FeatureKey[];

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
];

export function featuresByGroup(): Record<FeatureGroup, FeatureDef[]> {
  const out = Object.fromEntries(
    FEATURE_GROUPS.map((g) => [g, [] as FeatureDef[]]),
  ) as Record<FeatureGroup, FeatureDef[]>;
  for (const f of FEATURE_DEFS) out[f.group].push(f);
  return out;
}