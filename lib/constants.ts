// League-wide constants. All scoring rules live here so they are easy to tweak.

export const RANK_POINTS: Record<number, number> = {
  1: 15,
  2: 12,
  3: 10,
  4: 8,
  5: 6,
  6: 4,
  7: 2,
};

export const PENALTIES = {
  MISSED_MATCH: -5,
  TWO_CONSECUTIVE_MISSES_EXTRA: -5,
  THREE_CONSECUTIVE_MISSES_EXTRA: -10,
} as const;

export const BONUSES = {
  CONSISTENCY: 7, // 3 consecutive top-5 finishes
  KING_SLAYER: 5, // finish above current overall #1
  COMEBACK: 5, // gain 4+ leaderboard positions after a match
  UNDERDOG: 6, // ranked 10-13 overall finishing top 2
  MATCH_DOMINATION: 5, // win by 100+ Dream11 points difference
  BOUNTY: 3, // beating the bounty holder
} as const;

export const MAX_BONUS_PER_MATCH = 10;

export const PREDICTION_POINTS = {
  WINNER: 3,
  TOP_BATTER: 4,
  TOP_BOWLER: 4,
  ALL_THREE_BONUS: 20,
} as const;

export const MATCH_STATUS = ["upcoming", "live", "completed"] as const;
export type MatchStatus = (typeof MATCH_STATUS)[number];

export const ROLES = ["user", "admin", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

export const TOTAL_PLAYERS = 13;
