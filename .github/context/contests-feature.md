# Contests feature

User-facing live view of My11Circle teams overlaid on our league.

## Pages

- `/contests` — main page. Shows the "current" match (priority: live → most-recent completed → next upcoming, all filtered to matches with `contestUrl`). Live polls. Below: "📜 Past contests" list of completed matches with contestUrl + the viewer's rank/score in each.
- `/contests/[matchId]` — per-match view of any matched user's team. Reuses `TeamPitch`. Compare button opens picker.
- `/contests/[matchId]/compare/[userId]` — Dream11-style side-by-side comparison. Common players are highlighted; differing picks split. Captain/VC chips are amber/sky for you, **red** for the opponent's (per-side semantics).

## Key components

- `components/contest/contests-view.tsx` — main page, exports `TeamPitch`. Contains `ComparePicker` (popover dropdown, blurred bg, escape-to-close).
- `components/contest/contest-match-view.tsx` — per-match page client component. Has Compare picker only (no "switch view"). Premium overlay popover.
- `components/contest/compare-view.tsx` — full comparison page.
- `components/contest/player-avatar.tsx` — sized avatar with imgURL → fallback gradient + initials, captain/VC color rings, `referrerPolicy="no-referrer"`.

## APIs

- `GET /api/contests/current` — current match + your team + holders + leaderboard
- `GET /api/contests/[matchId]/team/[userId]` — any user's team for a match
- `GET /api/contests/[matchId]/holders` — list of users who have a mapped team for that match
- `GET /api/contests/past` — last 40 completed matches with contestUrl, joined with your UserMatchTeam for rank/score

All driven by `services/contest.ts`:

- `resolveCurrentContestMatch()` — the live/completed/upcoming priority resolver
- `getCachedLeaderboard(contestUrl, ttlMs)` — TTL'd leaderboard fetch
- `getRefreshedUserMatchTeam({ matchId, userId, force })` — fetch + persist + cache user team
- `listMatchTeamHolders(matchId)` — users with mapped teams
- `normalizeTeamFlags(team)` — re-derive captain/vc flags from captainIds/viceCaptainIds
- `getMy11LiveRefreshMs()` — Settings.my11LiveRefreshSec → ms

## Live polling pattern

```ts
useEffect(() => {
  if (!data?.ok || data.match.status !== "live") return;
  const visibleRef = { current: !document.hidden };
  const onVis = () => {
    visibleRef.current = !document.hidden;
    if (!document.hidden) void load();
  };
  document.addEventListener("visibilitychange", onVis);
  const id = window.setInterval(() => { if (visibleRef.current) void load(); }, data.refreshMs);
  return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
}, [data?.match.status, data?.refreshMs]);
```

## My11 name change flow

`actions/my11-name.ts`:

1. User opens dialog (`components/my11-name-change-dialog.tsx`) — bottom-sheet on mobile, centered modal on desktop. Premium look with blurred bg, gradient header, ESC-to-close, body scroll lock.
2. **Step 1 — Request**: `requestMy11NameChangeAction(newName)` writes `User.my11NameRequest = { status: "pending" }`. Short-circuits to `"approved"` if (a) user is in the 6h grace window, or (b) already has an approved request.
3. **Step 2 — Admin approval**: `components/admin/my11-name-change-queue.tsx` (Admin → Approvals tab, gated by `users.manage`). `adminApproveMy11NameAction(userId)` flips status to `"approved"`. Deny sets `"denied" + deniedReason`.
4. **Step 3 — Verify**: `verifyMy11NameAction(name)` calls `services/my11-name-verify.ts::verifyMy11NameAgainstRecentMatches(name)` which hits **live my11 API** for up to 3 most recent completed matches with contestUrl and looks for the candidate name (normalized) with `score > 0`. Returns `matched` + sample (teamA, teamB, score, rank) or a friendly reason (`no_recent_match`, `auth_expired`, `my11_not_ready`, `fetch_failed`).
5. **Step 4 — Save**: `saveMy11NameAction(name)` re-runs verification server-side (client can't bypass), then sets `User.my11circleName`, opens a 6h `my11NameChangeGraceUntil`, clears the request, and **propagates the name to `UserMatchTeam.my11Username`** for that user.
6. Within the 6h window: change-again skips admin approval and goes straight to verify+save. Verification failures don't reset the timer.

UI rule: **No browser `alert()`** anywhere — use the custom warning panel inside the dialog.
