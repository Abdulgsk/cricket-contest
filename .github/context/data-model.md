# Data model

All schemas in `models/`. Mongoose 9, all use `timestamps: true` unless noted.

## User

`models/User.ts`

- `userId` (handle, unique, lowercase) · `username` (display) · `password` (PLAINTEXT) · `whatsapp` · `my11circleName`
- `role: "user"|"admin"|"superadmin"` — the legacy `"admin"` value is still in
  the enum for back-compat but is **inert** (no implicit access). UI hides it.
- `permissionBitmap: string` — authoritative bitmask of granted features (each
  feature's bit position = its index in `FEATURE_DEFS`). Encoded as a decimal
  string in BigInt form. Written by `actions/admin.ts::saveUserFeaturesAction`
  via `$set: { permissionBitmap }` + `$unset: { enabledFeatures, features }`.
- `enabledFeatures: FeatureKey[]` — **legacy** array, kept only for back-compat.
  Reads fall back to it (and `features`) only when `permissionBitmap === "0"`.
  Do not write to it.
- `customRoleId: ObjectId | null` — ref to `Role`. Effective features =
  `permissionBitmap (or legacy array)` ∪ `role.features` (merged in
  `lib/session.ts`).
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

## Role

`models/Role.ts` — named feature bundles ('custom roles'). Assigning a custom
role sets `User.customRoleId` and forces `User.role = "user"` so privilege
escalation can't happen through role choice alone.

- `name` (unique, trimmed)
- `features: FeatureKey[]` — keys from `lib/features.ts::FEATURE_KEYS`
- timestamps

Deletion is blocked while any user references the role.

## AuditLog / BonusAuditLog / PredictionAuditLog

- `AuditLog` — generic action trail. Fields: `actorId`, `actorHandle`,
  `actorUsername`, `category` (`create|update|delete|auth|action`), `action`
  (dot-namespaced verb), `targetType`, `targetId`, `meta`, `ip`, `userAgent`,
  `createdAt` (indexed `-1`). Written via `lib/audit.ts::recordAudit()` which
  reads request headers and never throws.
- `BonusAuditLog` — one row per granted bonus per match with `explanation` (consumed by AI narrator).
- `PredictionAuditLog` — diffs around admin resets.

## DailyFact

AI-narrated storylines per match.

- `matchId`, `text`, `type`, `score` (interest 40-95), `userId?`
- `batchNumber` — append-only; dashboard shows only the latest batch.

## Notification

Per-user inbox row (rivalry events, approvals decided, etc).

- `userId`, `kind`, `title`, `body`, `link?`, `readAt`

## BugReport

`models/BugReport.ts` — user-submitted issues + assignee/admin workflow.

- `title`, `description`, `severity: "low"|"medium"|"high"`, `pageUrl?`
- `status: "open"|"in_progress"|"resolved"|"wont_fix"`
- `reporterId`, `reporterHandle`, `reporterName`
- `assignedTo?`, `assignedToHandle?`, `assignedToName?`
- `adminNotes?` — private admin-only notes
- `submission: { kind: "fixed"|"blocked"|"wont_fix", note, submittedAt,
  submittedById, submittedByHandle, submittedByName } | null` — **write-once**
  outcome posted by the assignee. Once set, only admin
  `reopenBugAction` may clear it.
- `needsAdminReview: boolean` (indexed) — true when a submission is awaiting
  admin accept/reject.
- `resolutionNote?`, `resolvedAt?` — legacy fields, still populated for
  back-compat readers.
- Compound index `{ assignedTo: 1, "submission.submittedAt": -1 }`.
- **Soft-delete**: `deletedAt?: Date | null` (indexed), `deletedById?: ObjectId | null`. Set by `deleteBugReportAction`. All reader queries filter `{ deletedAt: null }`; the doc is kept for audit.
- **Activity log** (`activity[]`, embedded `BugActivitySchema`): comment + lifecycle entries. Each entry has its own `_id`, `at`, `byId`, `byName`, `byHandle`, `kind`, `text`, `mentions`, `reactions`, plus `deletedAt`, `deletedById`, `deletedByName`, `deletedByHandle` for tombstoned comments (text/mentions/reactions are cleared on delete).

Full workflow: see [admin.md](admin.md#bug-reports).

## WorkItem

`models/WorkItem.ts` — internal tasks/tickets owned by the developer role.

- `title`, `description`, `priority`, `dueAt?`
- `status: "todo"|"in_progress"|"blocked"|"done"`
- `assignedToId?`, `assignedToHandle?`, `assignedToName?`
- `submission`, `needsReview` — same write-once accept/reject pattern as bugs.
- **Soft-delete**: `deletedAt?: Date | null` (indexed), `deletedById?: ObjectId | null`. Set by `deleteWorkItemAction`. All reader queries filter `{ deletedAt: null }`.
- **Activity log** (`activity[]`, `WorkItemActivitySchema`): same shape and soft-delete fields as `BugReport.activity`.

## Soft-delete policy (cross-cutting)

User-generated content is never hard-deleted. See [conventions.md#soft-deletes-hard-rule](conventions.md#soft-deletes-hard-rule) for the rule. Affected collections today: `BugReport` (doc + `activity[]`), `WorkItem` (doc + `activity[]`).
