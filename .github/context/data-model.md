# Data model

All schemas in `models/`. Mongoose 9, all use `timestamps: true` unless noted.

## User

`models/User.ts`

- `userId` (handle, unique, lowercase) · `username` (display) · `password` (PLAINTEXT) · `whatsapp` · `my11circleName`
- `role: "user"|"admin"|"superadmin"`
- `enabledFeatures: FeatureKey[]` — per-admin feature gates
- `avatar` (data URI, ≤192KB) · `avatarColor` · `bio` (≤280 chars)
- `lastSeenRivalryAt` — for the "new rivalry" badge
- `my11NameRequest: { requested, requestedAt, status: pending|approved|denied, decidedAt, deniedReason }` — name change approval state
- `my11NameChangeGraceUntil` — 6h window after a verified save during which the user can re-verify+save without admin approval

## Match

- `teamA`, `teamB`, `teamAShort`, `teamBShort`, `startTime`, `venue`, `season`
- `status: "upcoming"|"live"|"completed"`
- `contestUrl` — my11circle contest URL (enables Contests tab + my11 leaderboard lookups for this match)
- `resultsEntered: boolean`
- `bountyUserId` — admin-picked bounty target
- `matchWinner`, `scoreSummary` (manually entered post-match)
- `modes: ("2x_points"|"no_bonus"|"chaos"|"prediction_madness")[]`
- `predictionsLockedAt`, `rivalryLockedAt`, etc. — extension knobs from `match.lock.extend`

## MatchResult

Per (matchId, userId). Created when admin enters results.

- `fantasyPoints` (Dream11 score) · `rank` (1..13, 0 = missed) · `rankPoints` (base from rank table)
- `bonusPoints`, `rivalryPoints`, `civilWarPoints`, `penaltyPoints` · `finalPoints` (sum)
- `bonuses: Array<{ type, points, cap_applied? }>` · `missed: boolean`
- `consecutiveMissCount` (post-this-match)

## Prediction

Per (matchId, userId).

- `winner`, `topBatter`, `topBowler` (strings)
- `submittedAt`, `lockedAt` · `scored`, `pointsAwarded`, `correctWinner`, `allThreeBonus`

## Rivalry

- `matchId`, `challengerId`, `opponentId`
- `status: "pending"|"accepted"|"declined"|"cancelled"`
- `acceptedAt`, `settled`, `winnerId`, `pointsAwarded`, `isRevenge`
- `withdrawalRequestedAt`, `withdrawalRequestedBy`, `cancelledBy`

## CivilWar

Per `matchId`. Created/updated when rivalries are accepted/withdrawn.

- `members: Array<{ userId, side: "A"|"B", rivalryId }>`
- `result: { teamAWinners, teamBWinners, teamAFp, teamBFp, outcome, teamAPointsPerMember, teamBPointsPerMember, captainAUserId, captainBUserId }`
- `outcome`: `A_decisive`, `B_decisive`, `A_split`, `B_split`, `A_fp_tiebreak`, `B_fp_tiebreak`, `draw`, `not_eligible`
- Sides are randomised across the whole rivalry graph every time a member is added/removed (`services/civil-war.ts::randomizeCivilWarSides`).

## CustomPool / CustomPoolPrediction

- Admin-defined side pools attached to a match. Members predict from a list of options. Resolved manually after match.

## Settings (singleton)

- `bonusConfig`, `civilWarConfig`, `predictionConfig` overrides
- `customBonuses[]` (user-defined rules)
- `bounty`, `announcement`, `noBonusActive`, etc.
- `my11sessionCookie`, `my11cookieExpiresAt`, `my11LiveRefreshSec` (default 30, range 5-600)

Always read via `getSettings()` to merge with defaults.

## UserMatchTeam

`models/UserMatchTeam.ts` — per (matchId, userId) cached snapshot of the user's Dream11 team for that match (pulled from my11circle).

- `my11MatchId`, `my11ContestId`, `my11UserTeamId`, `my11Username`
- `userTeamName`, `rank`, `score`, `captainName`, `viceCaptainName`, `captainIds[]`, `viceCaptainIds[]`
- `players[]` — full per-player breakdown (name, role, fantasyPoints, isCaptain, isViceCaptain, imgURL, …)
- `fetchedAt`, `sourceUpdatedAt`
- Unique index `(matchId, userId)`. Re-fetched on demand via `services/contest.ts::getRefreshedUserMatchTeam()`.

## AuditLog / BonusAuditLog / PredictionAuditLog

- `AuditLog` — generic admin action trail.
- `BonusAuditLog` — one row per granted bonus per match with `explanation` (consumed by AI narrator).
- `PredictionAuditLog` — diffs around admin resets.

## DailyFact

AI-narrated storylines per match.

- `matchId`, `text`, `type`, `score` (interest 40-95), `userId?`
- `batchNumber` — append-only; dashboard shows only the latest batch.

## Notification

Per-user inbox row (rivalry events, approvals decided, etc).

- `userId`, `kind`, `title`, `body`, `link?`, `readAt`
