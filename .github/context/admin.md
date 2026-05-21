# Admin

## Role model

There are now only two **system roles** the UI exposes:

- `user` — default
- `superadmin` — implicit all-features-on

The legacy `"admin"` system role is still accepted by the DB enum for backward
compatibility, but it grants **no implicit access** anymore. Treat any user with
`role === "admin"` as identical to `user`. The dropdown in
`components/admin/user-role-assign.tsx` no longer offers it.

Everything between `user` and `superadmin` is expressed via **custom roles**
(`models/Role.ts`) or **per-user feature flags** (`User.enabledFeatures`).
Effective features = `User.enabledFeatures` ∪ `Role.features` (merged in
`lib/session.ts::getCurrentUser`).

## Admin console access

`lib/rbac.ts::requireAdminAccess()` allows in:

- superadmins, OR
- any user with at least one entry in `enabledFeatures`
  (which includes anyone with a custom role, since session merge populates
  `enabledFeatures` from the role).

Plain admins with no granted features land back on `/`.

## Page layout

`app/(app)/admin/page.tsx` uses `AdminOverviewTabs`. Tabs render only when their
gate passes — feature-only users never see the admin-flavoured tabs:

| Tab           | Component                                                          | Gate |
|---------------|--------------------------------------------------------------------|------|
| Your tools    | Card grid of granted features → deep links                         | non-superadmin viewers |
| Overview      | inline KPIs + Next-up matches                                      | superadmin |
| Approvals     | `RivalryWithdrawalQueue` + `My11NameChangeQueue`                   | `rivalry.withdraw.approve` ∨ `users.manage` |
| Bonus Rules   | `BonusSettingsPanel`                                               | `bonus.manage` |
| Civil War     | `CivilWarSettingsPanel`                                            | `civilwar.points.manage` ∨ superadmin |
| Operations    | `AutomationTools` (`automation.run`) + `RegenerateFactsButton` (`facts.regenerate`) + `My11LiveSettingsPanel` (superadmin) | superadmin |
| Docs          | inline help                                                        | superadmin |

Other admin pages:

- `/admin/matches` — list + Sync IPL + create match panels gated by
  `matches.manage`. The Enter/Edit/Open button label reflects whether the
  viewer has `results.manage`. Page redirects to `/admin` if the viewer has
  none of `matches.manage`, `results.manage`, `match.lock.extend`.
- `/admin/matches/[id]/result` — uses `requireAdminAccess()` (NOT
  `requireRole`). Each panel self-gates: `MatchModesPanel`, `ContestUrlForm`,
  `MatchBountyPanel`, `CustomPoolEditor` need `matches.manage`;
  `MatchLockExtensionsPanel` needs `match.lock.extend`; `PredictionResetPanel`
  + `ResultEntryForm` need `results.manage`. Redirects if none of those.
- `/admin/users` — gated by `users.roles.assign` ∨ `users.delete` ∨
  `users.manage`. The Roles & Permissions column shows `UserRoleAssign` +
  `UserFeatureControls` (`users.roles.assign`) and `DeleteUserButton`
  (`users.delete`) independently. Mobile renders as stacked cards, desktop as
  a table.
- `/admin/audit-logs` — gated by `audit.view`. Mobile = stacked event cards
  with collapsible details; desktop = full table.
- `/admin/settings` — superadmin only (announcement banner, my11 cookie,
  refresh interval).

## Feature flags

`lib/features.ts` is the **single source of truth**. Each entry has
`{ key, label, description, group, sensitive? }`:

```ts
export const FEATURE_DEFS = [
  // Matches
  "matches.manage",
  "match.lock.extend",
  // Results
  "results.manage",          // sensitive
  // Bonuses
  "bonus.manage",            // sensitive
  // Civil War
  "civilwar.points.manage",  // sensitive
  // Users
  "users.manage",            // approve my11-name requests
  "users.roles.assign",      // sensitive — pick role / save features for any user
  "users.delete",            // sensitive
  "rivalry.withdraw.approve",
  // Audit
  "audit.view",
  // Tools
  "automation.run",          // status refresh, sync, force-complete
  // Content
  "facts.regenerate",        // re-run AI storylines
] as const;
```

Groups (`FeatureGroup`) drive the grouped picker UI. `featuresByGroup()` returns
features bucketed by group. `FEATURE_BY_KEY[key]` returns the full def.

### Adding a new feature

1. Add an entry to `FEATURE_DEFS` in [`lib/features.ts`](../../lib/features.ts).
2. Gate the relevant UI region with `userHasFeature(me, "<key>")`.
3. Gate the relevant server action with `requireAdminFeature("<key>")`.

That's it — the roles editor and per-user picker pick it up automatically.

`lib/rbac.ts`:

- `userHasFeature(user, key)` — superadmins always true; everyone else must
  have the key in `enabledFeatures` (the legacy `"admin"` role no longer gets
  blanket access).
- `requireAdminFeature(key)` — redirects to `/` if not.
- `userHasAdminAccess(user)` — true for superadmin OR anyone with at least one
  enabled feature.

## Custom roles

`models/Role.ts` = `{ name (unique), features: FeatureKey[] }`. Created /
edited / deleted via `actions/admin.ts::createRoleAction`,
`updateRoleAction`, `deleteRoleAction`. Deletion is blocked while any user
references the role (`User.customRoleId`). `setRoleAction` /
`assignUserRoleAction` clear `customRoleId` when switching to a system role.

The dropdown in `components/admin/user-role-assign.tsx` lists optgroups
"System" (User, Superadmin) and "Custom" (every `Role` doc). Selecting a
custom role sets base `role: "user"` + `customRoleId` so privilege escalation
can't happen by accident.

## Feature-selection UI

Both the custom-role editor and the per-user feature panel share
`components/admin/feature-checklist.tsx`:

- Live search across labels, descriptions and raw keys
- Per-group "All / None" buttons + `n/m` counters
- Each row shows label, `sensitive` badge, raw key (mono), and description
- A `lockedAllChecked` mode renders every box checked + disabled with a hint
  (used for superadmin in `UserFeatureControls`)

`UserFeatureControls` is wrapped in a `<details>` so the long picker doesn't
clutter the users table by default.

## Approval queues

### Rivalry withdrawal

Path: `actions/rivalry.ts::requestWithdrawAcceptedAction` → admin reviews in
`RivalryWithdrawalQueue` → `adminResolveRivalryWithdrawalAction({rivalryId, approve})`
(`requireAdminFeature("rivalry.withdraw.approve")`).

Approving = no penalty, clears the rivalry, removes both players from Civil
War membership (which triggers a side re-randomize for the remainder).
Denying = notifies the user; the rivalry stays accepted.

### My11 name change

Path: `actions/my11-name.ts::requestMy11NameChangeAction` → admin reviews in
`My11NameChangeQueue` → `adminApproveMy11NameAction` / `adminDenyMy11NameAction(reason?)`
(`requireAdminFeature("users.manage")`).

Approving does NOT save the name — it unlocks the user's verify+save step. The
user still must pass the live-leaderboard verification. See
[contests-feature.md](contests-feature.md).

## Settings panel quick reference

Superadmin-only knobs surfaced in `/admin/settings`:

- My11 session cookie (paste/refresh) — usually written by the Chrome extension
- `my11LiveRefreshSec` (5-600) — TTL for the leaderboard/team caches
- Announcement banner text + tone

## Automation tools

`components/admin/automation-tools.tsx` (gate: `automation.run`):

- Refresh match statuses (now)
- Sync IPL fixtures (now) — calls Sportskeeda scraper via `services/ipl-sync.ts`
- Force complete match (superadmin) — manually marks completed and locks predictions

## Audit log

`models/AuditLog.ts` — fields: `actorId`, `actorHandle`, `actorUsername`,
`category` (`create|update|delete|auth|action`), `action`, `targetType`,
`targetId`, `meta`, `ip`, `userAgent`, `createdAt` (indexed `-1`).

Helper: `lib/audit.ts::recordAudit({...})` — auto-captures IP + UA via
`headers()`; never throws (errors are swallowed).

Wired into all user-facing actions: signup, login, login.failed, logout,
password.change, profile.update, prediction.submit, rivalry.create / revenge /
accept / decline / cancel / withdraw.request, admin approve/deny flows,
my11-name.request / save / approve / deny, custom-pools.create / delete /
predict, role catalog CRUD, role assignment, feature saves, user deletion,
facts regeneration.

Viewer: `/admin/audit-logs` (gate: `audit.view`) with category / action /
actor filters and pagination.

## Result entry safeguards

- Per match, one `MatchResult` per user. Re-running scoring deletes previous rows for that match and recomputes.
- Bonuses re-apply with the **current** `Settings.bonusConfig` and `customBonuses[]` — useful after tweaks.
- Always cap awarded bonuses at `MAX_BONUS_PER_MATCH` (or admin-overridden value).
- `BonusAuditLog` is wiped + reinserted per regen so the AI narrator sees the new reasons.
