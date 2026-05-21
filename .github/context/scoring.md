# Scoring engine

Authoritative source: `lib/constants.ts` (values) + `services/scoring.ts` (logic).

## Per-match flow (when admin enters results)

`actions/admin.ts::processMatchResults()`:

1. Validate input (one entry per player who played; rank 1..N; missed users get rank=0).
2. Compute `MatchResult` docs with `fantasyPoints`, `rank`, base `rankPoints`, missed flag.
3. Run **scoring engine** (`services/scoring.ts`):
   - Apply consecutive-miss tracking per user.
   - Run bonus engine (caps at `MAX_BONUS_PER_MATCH`).
   - Add bounty, rivalry, civil-war point deltas.
   - Apply special match modes from `Match.modes` (2x rank pts, no bonus, chaos doubles bonus, prediction madness doubles prediction pts).
4. Process predictions → `services/prediction-engine.ts` (winners + top-batter + top-bowler + all-three bonus).
5. Settle rivalries (winner = higher fantasyPoints; revenge gets extra) → `actions/rivalry.ts::settleRivalriesForMatch()`.
6. Compute Civil War outcome → `services/civil-war.ts::computeCivilWarOutcome()` → write `CivilWar.result`.
7. Write `BonusAuditLog`, `PredictionAuditLog` rows (one per granted bonus, with `explanation` string used by AI narrator).
8. Generate daily facts → `services/facts.ts::generateFactsForMatch()` (calls AI).
9. `revalidatePath("/dashboard","/leaderboard","/matches","/admin")`.

## Rank points (1..13)

| Rank | Pts |
|------|-----|
| 1    | 15  |
| 2    | 12  |
| 3    | 10  |
| 4    | 8   |
| 5    | 6   |
| 6    | 4   |
| 7    | 2   |
| 8-13 | 0   |

(Match results page may show older defaults — values in `lib/constants.ts` are the truth.)

## Penalties

- Missed match: `MISSED_MATCH` (−5). FantasyPoints = 0 for the match.
- 2 consecutive misses: extra `TWO_CONSECUTIVE_MISSES_EXTRA` (−5).
- 3 consecutive: extra `THREE_CONSECUTIVE_MISSES_EXTRA` (−10).
- Rivalry withdrawal (self): −2 on the match.

## Bonuses

Each capped per match by `MAX_BONUS_PER_MATCH=10`. Defaults in `BONUSES`:

| Key                  | Default | Trigger |
|----------------------|---------|---------|
| CONSISTENCY          | 3       | Top-5 fantasy points in 3 matches in a row |
| KING_SLAYER          | 4       | Outscore pre-match leaderboard #1 |
| COMEBACK             | 5       | Climb 4+ leaderboard positions after the match |
| UNDERDOG             | 6       | Pre-match position 10-13 AND finish top-2 |
| MATCH_DOMINATION     | 5       | Win by 100+ Dream11 points over 2nd |
| TOPPER_DEFENDS_TOP   | 2       | Pre-match #1 stays #1 |
| TOPPER_TOPS_MATCH    | 2       | Pre-match #1 also wins this match's fantasy points |
| CAPTAIN_TEAM_WIN     | 1       | Your Civil War side's captain has higher FP than opposing captain |
| LEADER_TOPPER_BONUS  | 1       | Overall #1 (not in Civil War) outscores both side captains |
| BOUNTY               | 3       | Beating the admin-set bounty target by rank |
| RIVALRY              | 3       | Winning a 1v1 rivalry (revenge = +RIVALRY_REVENGE extra) |

Values are admin-tunable via `Settings.bonusConfig` (panel: `components/admin/bonus-settings-panel.tsx`). Always read effective values via `getSettings()`, not the constants directly, when scoring.

## Custom bonuses

`Settings.customBonuses[]` — admin-defined extra bonuses with `conditionLogic: "all"|"any"` and condition types like `fantasy_points_gte`, `rank_lte`, etc. Applied in `services/scoring.ts`.

## Predictions

`PREDICTION_POINTS`: WINNER=3, TOP_BATTER=4, TOP_BOWLER=4, ALL_THREE_BONUS=1.

- Locked on submit; hidden from everyone (incl. superadmin) until match start.
- Admin can RESET (delete) before match start but cannot view.
- Per-match modes can double prediction points (`prediction_madness`).

## Match modes

`Match.modes[]` (`2x_points`, `no_bonus`, `chaos`, `prediction_madness`). Applied in scoring engine.

## Match locks

`lib/match-locks.ts` — `isModuleLocked(match, module)` for `predictions`, `rivalry`, `custom_pools`. Admin can extend lock time per-module via the **Match lock extensions panel** (`match.lock.extend` feature).
