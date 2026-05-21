# My11Circle integration

## Why it exists

Users play Dream11 / My11Circle externally. Once they enter a contest URL, we can pull their team + the contest's leaderboard via my11's mobile REST API and overlay all our scoring/rivalry/Civil War features on top.

## Auth model

My11Circle has no public API. We piggyback on the **session cookie** of one logged-in admin account:

- `Settings.my11sessionCookie` + `my11cookieExpiresAt` — written by the Chrome extension in `extension/` (the popup posts to `/api/admin/my11-cookie` with `MY11_COOKIE_SYNC_TOKEN`).
- Some envs additionally run a **mini-browser** Node service (Puppeteer) — see `/memories/repo/my11-mini-browser.md`. Endpoints: `MY11_MINI_BROWSER_URL`, `MY11_MINI_BROWSER_TOKEN`. Generic JSON proxy: `/api/admin/my11-mini-browser/route.ts` (locked to `my11circle.com` URLs only).

When the cookie expires, calls throw `My11AuthError`. UI surfaces it as "My11Circle session expired — admin must refresh, then retry."

## Core library

`lib/my11-api.ts`:

- `fetchLeaderboardFromContestUrl(url) → { matchId, contestId, entries: My11LeaderboardRow[] }` — live REST call, NOT cached at this layer
- `getUserTeamDetails({ matchId, contestId, teamId }) → IUserMatchTeamPlayer[]` etc.
- Errors: `My11AuthError`, `My11NotReadyError` (always handle both)

`lib/my11circle.ts`:

- `normalizeMy11circleName(s)` — lowercase, trim, strip whitespace/punctuation. **All username comparisons must use this.**

## Caching

In `services/contest.ts`:

- `lbCache: Map<contestUrl, { at, data }>` — leaderboard cache
- `teamCache: Map<"${matchId}:${userId}", { at, data }>` — user team cache
- TTL = `Settings.my11LiveRefreshSec` * 1000 (default 30000ms, superadmin-tunable 5-600s)
- Caches are process-local — fine for Vercel because polls cluster on the same warm function.

## Username-to-user mapping

- `User.my11circleName` is the **only source of truth** for what handle a user uses on my11.
- Lookups (e.g., `actions/admin.ts::resyncMy11TeamScores`) compare `normalizeMy11circleName(row.username) === normalizeMy11circleName(user.my11circleName)`.
- When a user changes their name (see [contests-feature.md](contests-feature.md)), `actions/my11-name.ts::saveMy11NameAction` propagates the new value to `UserMatchTeam.my11Username` via `updateMany` — so display strings stay current. But **never** read `UserMatchTeam.my11Username` as authoritative; it's a denormalized snapshot.

## Captain / vice-captain flags

My11 payloads have:
- `players[].isCaptain` / `isWicketKeeper` — the **on-field match captain/keeper** (NOT the user's fantasy choice).
- Top-level `captainIds[]` / `viceCaptainIds[]` — these are the user's fantasy picks.

`lib/my11-api.ts::normalizeTeamPlayer` ignores the per-player flags and only sets `isCaptain`/`isViceCaptain` from the top-level arrays. `services/contest.ts::normalizeTeamFlags()` re-derives them again at read time in case stale DB rows from older bugs still exist.

If you see "3 captains" anywhere, this is the bug to look for.

## IPL fixture sync

`services/ipl-sync.ts` scrapes Sportskeeda (see `lib/scrapers/`). Idempotent — only inserts new matches, updates upcoming ones. Triggered:

- Manually from Admin → Operations → "Sync fixtures now"
- Daily at 00:30 UTC by `/api/cron/daily-sync`
