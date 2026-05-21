# Admin

## Page layout

`app/(app)/admin/page.tsx` uses `AdminOverviewTabs`:

| Tab           | Component                                | Gate |
|---------------|------------------------------------------|------|
| Overview      | inline KPIs + Next-up matches            | always |
| Approvals     | `RivalryWithdrawalQueue` + `My11NameChangeQueue` | `rivalry.withdraw.approve` ∨ `users.manage` |
| Bonus Rules   | `BonusSettingsPanel`                     | `bonus.manage` |
| Civil War     | `CivilWarSettingsPanel`                  | `civilwar.points.manage` ∨ superadmin |
| Operations    | `AutomationTools` + `RegenerateFactsButton` + `My11LiveSettingsPanel` (superadmin) | always |
| Docs          | inline help                              | always |

Other admin pages:

- `/admin/matches` — match list, create, edit modes, set bounty, lock extensions, result entry (`results.manage`)
- `/admin/matches/[id]/result` — full result entry form (`components/admin/result-entry-form.tsx`)
- `/admin/users` — list, promote, delete, manage features (`users.manage`)
- `/admin/settings` — superadmin settings (announcement, my11 cookie, etc.)

## Feature flags

`lib/features.ts` — single source for keys + labels:

```ts
export const FEATURE_KEYS = [
  "bonus.manage",
  "matches.manage",
  "match.lock.extend",
  "results.manage",
  "users.manage",
  "rivalry.withdraw.approve",
  "civilwar.points.manage",
] as const;
```

`lib/rbac.ts`:

- `userHasFeature(user, key)` — superadmins always true
- `requireAdminFeature(key)` — throws if not
- Use these on every admin server action and gated UI region

## Approval queues

### Rivalry withdrawal

Path: `actions/rivalry.ts::requestWithdrawAcceptedAction` → admin reviews in `RivalryWithdrawalQueue` → `adminResolveRivalryWithdrawalAction({rivalryId, approve})`.

Approving = no penalty, clears the rivalry, removes both players from Civil War membership (which triggers a side re-randomize for the remainder). Denying = notifies the user; the rivalry stays accepted.

### My11 name change

Path: `actions/my11-name.ts::requestMy11NameChangeAction` → admin reviews in `My11NameChangeQueue` → `adminApproveMy11NameAction` / `adminDenyMy11NameAction(reason?)`.

Approving does NOT save the name — it unlocks the user's verify+save step. The user still must pass the live-leaderboard verification. See [contests-feature.md](contests-feature.md).

## Settings panel quick reference

Superadmin-only knobs surfaced in `/admin/settings`:

- My11 session cookie (paste/refresh) — usually written by the Chrome extension
- `my11LiveRefreshSec` (5-600) — TTL for the leaderboard/team caches
- Announcement banner text + tone

## Automation tools

`components/admin/automation-tools.tsx`:

- Refresh match statuses (now)
- Sync IPL fixtures (now) — calls Sportskeeda scraper via `services/ipl-sync.ts`
- Force complete match (superadmin) — manually marks completed and locks predictions

## Result entry safeguards

- Per match, one `MatchResult` per user. Re-running scoring deletes previous rows for that match and recomputes.
- Bonuses re-apply with the **current** `Settings.bonusConfig` and `customBonuses[]` — useful after tweaks.
- Always cap awarded bonuses at `MAX_BONUS_PER_MATCH` (or admin-overridden value).
- `BonusAuditLog` is wiped + reinserted per regen so the AI narrator sees the new reasons.
