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
  CONSISTENCY: 3, // 3 consecutive matches in top-5 fantasy points
  KING_SLAYER: 4, // beat current overall #1 by fantasy points in the same match
  COMEBACK: 5, // gain 4+ leaderboard positions after a match
  UNDERDOG: 6, // ranked 10-13 overall finishing top 2
  MATCH_DOMINATION: 5, // win by 100+ Dream11 points difference
  TOPPER_DEFENDS_TOP: 2, // pre-match leaderboard #1 stays #1 after this match
  TOPPER_TOPS_MATCH: 2, // pre-match leaderboard #1 also finishes #1 by fantasy points in match
  CAPTAIN_TEAM_WIN: 1, // captain (top leaderboard player on a Civil War side) has more FP than opposing captain → every teammate (incl. captain) +1
  LEADER_TOPPER_BONUS: 1, // overall leaderboard #1 not in this match's Civil War beats both captains' FP → +1
  BOUNTY: 3, // beating the bounty holder
  RIVALRY: 3, // winning a 1v1 rivalry challenge for the match
} as const;

export const MAX_BONUS_PER_MATCH = 10;

export const PREDICTION_POINTS = {
  WINNER: 3,
  TOP_BATTER: 4,
  TOP_BOWLER: 4,
  ALL_THREE_BONUS: 1,
} as const;

export const MATCH_STATUS = ["upcoming", "live", "completed"] as const;
export type MatchStatus = (typeof MATCH_STATUS)[number];

export const ROLES = ["user", "admin", "superadmin"] as const;
export type Role = (typeof ROLES)[number];

export const TOTAL_PLAYERS = 13;
