export const FEATURE_KEYS = [
  "bonus.manage",
  "matches.manage",
  "match.lock.extend",
  "results.manage",
  "users.manage",
  "rivalry.withdraw.approve",
  "civilwar.points.manage",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  "bonus.manage": "Manage bonus rules",
  "matches.manage": "Manage matches and modes",
  "match.lock.extend": "Extend prediction/rivalry lock time",
  "results.manage": "Enter results and scoring",
  "users.manage": "Manage user roles and access",
  "rivalry.withdraw.approve": "Approve rivalry withdrawals",
  "civilwar.points.manage": "Change Civil War point values",
};