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

// ---------------------------------------------------------------------------
// In-app fantasy game (Dream11-style, T20). All numbers tweakable here so the
// scoring engine in services/fantasy-scoring.ts never hardcodes a value.
// ---------------------------------------------------------------------------

/** The four selectable fantasy roles. */
export const FANTASY_ROLES = ["WK", "BAT", "AR", "BOWL"] as const;
export type FantasyRole = (typeof FANTASY_ROLES)[number];

/** Map a Cricbuzz/my11 role string to one of the four fantasy buckets. */
export function toFantasyRole(role?: string | null): FantasyRole {
  const r = (role ?? "").toLowerCase();
  if (r.includes("wk") || r.includes("keeper")) return "WK";
  if (r.includes("allrounder") || r.includes("all-rounder") || r.includes("rounder"))
    return "AR";
  if (r.includes("bowl")) return "BOWL";
  // "Batter", "Batsman", anything else → BAT
  return "BAT";
}

/** Squad composition limits for a valid 11-player fantasy team. */
export const FANTASY_TEAM_RULES = {
  TEAM_SIZE: 11,
  MIN: { WK: 1, BAT: 3, AR: 1, BOWL: 1 } as Record<FantasyRole, number>,
  MAX: { WK: 4, BAT: 6, AR: 4, BOWL: 6 } as Record<FantasyRole, number>,
  /** Dream11 caps how many players you may pick from a single real team. */
  MAX_PER_TEAM: 7,
  CAPTAIN_MULTIPLIER: 2,
  VICE_CAPTAIN_MULTIPLIER: 1.5,
  /** Up to 4 ordered backups (B1..B4) that auto-replace "Not Playing" starters. */
  MAX_SUBS: 4,
} as const;

/** Dream11 T20 points table (from the official rules). */
export const FANTASY_T20 = {
  batting: {
    run: 1,
    boundaryBonus: 4, // per four
    sixBonus: 6, // per six
    duck: -2, // batter/WK/AR dismissed for 0 (bowlers exempt)
    /** Highest single milestone reached is awarded (not cumulative). */
    milestones: [
      { runs: 100, bonus: 16 },
      { runs: 75, bonus: 12 },
      { runs: 50, bonus: 8 },
      { runs: 25, bonus: 4 },
    ],
  },
  bowling: {
    dotBall: 1, // per dot ball
    wicket: 30, // excludes run outs
    lbwBowledBonus: 8, // extra for an LBW or Bowled dismissal
    maidenOver: 12,
    /** Highest single haul milestone reached is awarded. */
    haul: [
      { wickets: 5, bonus: 12 },
      { wickets: 4, bonus: 8 },
      { wickets: 3, bonus: 4 },
    ],
  },
  fielding: {
    catch: 8,
    threeCatchBonus: 4, // awarded once at 3+ catches
    stumping: 12,
    runOutDirect: 12,
    runOutAssist: 6, // not a direct hit (split / thrower / non-direct)
  },
  /** Economy-rate buckets — only applied if minOvers bowled. Inclusive lower,
   * exclusive upper unless it's the final open-ended bucket. */
  economy: {
    minOvers: 2,
    buckets: [
      { maxBelow: 5, points: 6 },
      { maxBelow: 6, points: 4 },
      { maxBelow: 7.01, points: 2 },
      { maxBelow: 10, points: 0 },
      { maxBelow: 11.01, points: -2 },
      { maxBelow: 12.01, points: -4 },
      { maxBelow: Infinity, points: -6 },
    ],
  },
  /** Strike-rate buckets — non-bowlers only, min balls faced. Negative points
   * only apply below 70 (per Dream11 note). */
  strikeRate: {
    minBalls: 10,
    buckets: [
      { minAbove: 170, points: 6 },
      { minAbove: 150, points: 4 }, // 150.01–170
      { minAbove: 130, points: 2 }, // 130–150
      { minAbove: 69.99, points: 0 }, // 70–130 → neutral (70.00 inclusive)
      { minAbove: 60, points: -2 }, // 60–70
      { minAbove: 50, points: -4 }, // 50–59.99
      { minAbove: 0, points: -6 }, // below 50
    ],
  },
} as const;
