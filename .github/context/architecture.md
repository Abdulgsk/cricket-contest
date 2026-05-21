# Architecture

## Request shapes

| User action                  | Path                                                 |
|------------------------------|------------------------------------------------------|
| Sign up / login              | `actions/auth.ts` Server Action → `lib/session.ts` JWT in httpOnly cookie |
| Submit prediction            | `actions/predictions.ts` → `services/prediction-engine.ts` |
| Admin enters match result    | `actions/admin.ts::processMatchResults()` → `services/scoring.ts` → `services/facts.ts::generateFactsForMatch()` → `services/facts-ai.ts` |
| View live contest            | `app/(app)/contests/page.tsx` (RSC) → `services/contest.ts::resolveCurrentContestMatch()` + client polls `/api/contests/current` |
| View past contest match      | `app/(app)/contests/[matchId]/page.tsx` → `ContestMatchView` polls `/api/contests/[matchId]/team/[userId]` and `/holders` |
| Compare two users' teams     | `app/(app)/contests/[matchId]/compare/[userId]/page.tsx` → `CompareView` |
| Accept/withdraw rivalry      | `actions/rivalry.ts` → `services/civil-war.ts::attachRivalryToCivilWar()` (re-randomizes sides on every change) |
| Change my11circle name       | `actions/my11-name.ts` (request → admin approve → verify against live leaderboard → save → 6h grace window) |
| Vercel cron                  | `/api/cron/daily-sync` at 00:30 UTC → IPL fixture sync + status refresh + reminder dispatch |

## Auth flow

1. User logs in → `actions/auth.ts` validates against plaintext `User.password`.
2. JWT signed with `AUTH_SECRET` set as `SESSION_COOKIE` (httpOnly, sameSite=lax).
3. `proxy.ts` checks the cookie on every non-asset request and redirects unauthenticated users to `/login?next=...`.
4. `proxy.ts` only validates *signed/expired*; **role checks live inside layouts** via `requireRole(...)` from `lib/rbac.ts` because JWTs can be stale (e.g., right after a promotion).
5. `app/(app)/layout.tsx` calls `requireUser()`; `app/(app)/admin/layout.tsx` calls `requireRole("admin","superadmin")`.

## RBAC

- Three roles: `user`, `admin`, `superadmin`.
- `SUPER_ADMIN_USER_ID` env auto-promotes one handle on signup.
- Admins have **per-feature flags** (`User.enabledFeatures`). Keys defined in `lib/features.ts`:
  - `bonus.manage`, `matches.manage`, `match.lock.extend`, `results.manage`, `users.manage`, `rivalry.withdraw.approve`, `civilwar.points.manage`
- Superadmins always pass `requireAdminFeature(...)`.

## Database

- Single MongoDB connection cached on `globalThis` (HMR-safe) — see `lib/db.ts`.
- Every Mongoose model is registered once and re-used via `models[X] || model(...)` pattern.
- Indexes on the hot lookup fields (`matchId`, `userId`, `(matchId,userId)` uniques, `status`, `startTime`).

## Server Actions vs API routes

- **Server Actions** (`actions/*.ts`) — user mutations. They `"use server"`, return `{ ok, error? }`, and call `revalidatePath()` for stale views.
- **API routes** (`app/api/*/route.ts`) — needed for: client-side polling (live contests, civil war live), external webhooks (cron), admin tooling that pipes JSON to/from browser tools, and the my11 cookie sync from the Chrome extension.

## Caching layers

- In-process TTL caches (Map keyed by `contestUrl` or `${matchId}:${userId}`) in `services/contest.ts`. TTL = `Settings.my11LiveRefreshSec` (default 30s, tunable by superadmin).
- Visibility-aware polling on the client: pause on `document.hidden`, refetch on visible.
- `revalidatePath()` after writes so SSR pages pick up the new state on next navigation.

## Background work

- `vercel.json` registers one cron: `/api/cron/daily-sync` at 00:30 UTC. Reads `Authorization: Bearer ${CRON_SECRET}`.
- Match status transitions happen lazily: every admin/match page renders `autoUpdateMatchStatuses()` which promotes `upcoming → live` past their start time. `live → completed` only after results are entered.
