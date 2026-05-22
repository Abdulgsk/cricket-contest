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
(`models/Role.ts`) or **per-user feature flags** stored in
`User.permissionBitmap` (a BigInt-as-string bitmask whose bit positions come
from `FEATURE_DEFS` order; the legacy `enabledFeatures` array is still read as
a fallback when the bitmap is `"0"`). Effective features =
`bitmap_or_legacy_array ∪ Role.features` (merged in
`lib/session.ts::getCurrentUser`).

## Admin console access

`lib/rbac.ts::requireAdminAccess()` allows in:

- superadmins, OR
- any user with at least one granted feature
  (which includes anyone with a custom role, since session merge populates the
  effective feature set from the role).

Plain admins with no granted features land back on `/`.

## Admin shell layout

`app/(app)/admin/layout.tsx` is a server component that:

- Resolves a **role label** for the pill above the heading: `Superadmin` for
  the system superadmin; the custom role's `name` (from `Role`) for users with
  `customRoleId`; otherwise `Admin`.
- Computes the visible nav items via `getAccessibleAdminRoutes(me)`.
- Hands them to `<AdminNavTabs items={…} />`
  (`components/admin/admin-nav-tabs.tsx`), a **client component** that calls
  `usePathname()` so the active tab updates on every client-side navigation.
  Do not move active-tab logic back into the server layout — App Router
  layouts don't re-execute on sibling-page nav, so the highlight gets stuck.

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
  // Bugs
  "bugs.view",               // see the admin bug list
  "bugs.manage",             // assign / accept submissions / reopen / delete
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

- `userHasFeature(user, key)` — superadmins always true; everyone else is
  checked against `User.permissionBitmap` (decoded back to a feature set), with
  a fallback to the legacy `enabledFeatures` / `features` arrays only when the
  bitmap is `"0"`. The legacy `"admin"` system role no longer gets blanket
  access.
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

Both the custom-role editor and the per-user feature panel share the same
**master-detail editor** at `/admin/permissions` (gate:
`users.roles.assign`). It replaced the old per-user inline picker + matrix
view — there is now exactly one place to edit role/user permissions.

- Left rail: searchable list of users + custom roles.
- Right pane: `feature-checklist.tsx` (grouped by `FeatureGroup`, live search,
  per-group All/None, sensitive badges, raw keys, descriptions).
- A `lockedAllChecked` mode renders every box checked + disabled (used when
  viewing a superadmin).
- Saves go through `actions/admin.ts::saveUserFeaturesAction`, which writes
  `$set: { permissionBitmap }` + `$unset: { enabledFeatures, features }`.
  Do not dual-write the legacy arrays.

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

## Bug reports

Two-sided workflow with a **write-once submission lock** so admins and
assignees can't accidentally over-write each other.

Model: see [data-model.md#bugreport](data-model.md#bugreport).

### Server actions (`actions/bugs.ts`)

- `submitBugReportAction(payload)` — anyone signed in can file. Sets `status: "open"`.
- `assignBugReportAction({id, userId|null})` — `bugs.manage`. Setting an assignee on an `open` bug flips it to `in_progress`.
- `submitBugResolutionAction({id, kind, note})` — **assignee-only**. `kind` is one of `fixed | blocked | wont_fix`, `note` is 3-4000 chars. Writes the `submission` subdoc and flips `needsAdminReview: true`. **Rejects if `bug.submission` already exists** (`"You already submitted. Wait for the admin to review."`) — this is the no-back-and-forth lock.
- `acceptBugSubmissionAction(id)` — `bugs.manage`. Closes the bug per the submission kind (`fixed → resolved`, `wont_fix → wont_fix`, `blocked → in_progress` with cleared submission). Clears `needsAdminReview`.
- `reopenBugAction({id, reason?, keepAssignee = true})` — `bugs.manage`. Clears `submission` + `needsAdminReview`. Sets status to `in_progress` when keeping the assignee, otherwise `open` + unassigns.
- `updateBugReportAction({id, status?, adminNotes?})` — admin override (manual status / private notes).
- `deleteBugReportAction(id)` — `bugs.manage`.

### UI

- **Assignee** view at `/my-bugs` ([components/my-bug-resolve-form.tsx](../../components/my-bug-resolve-form.tsx)): three outcome tiles (Fixed / Blocked / Won't fix) + textarea + single submit. Once submitted, the form is replaced with a locked "Awaiting admin review" card.
- **Admin** view in the workspace card ([components/admin/bug-reports-admin.tsx](../../components/admin/bug-reports-admin.tsx)): toolbar with search + filter pills (`Needs review / Open / In progress / Closed / All` with counts). Each `BugCard` shows:
  - Amber accent stripe when `needsAdminReview` is true
  - `SubmissionPanel` rendering the assignee's outcome + note + timestamp
  - Quick actions:
    - When submission exists → emerald **Accept & close** + **Reopen for assignee**
    - When closed → only **Reopen** (+ small **Delete** link); no Assign chip, no Override panel
    - Otherwise → dashed **Assign** (when unassigned) + collapsible **Override** panel (status select + private notes + delete)
  - Assignee chip on the header doubles as an edit affordance — clicking opens `AssigneePicker` (search + per-user workload pill: 0 green / 1-2 amber / 3+ rose)

### `BugRow` projection requirement

The admin page (`app/(app)/admin/page.tsx`) hydrating `bugRows` **must include
both** `submission: BugSubmission | null` and `needsAdminReview: boolean`, or
the TS build fails.

## My11 Contest Picker access

`components/admin/result-entry-form.tsx` exposes a contest picker (list My11
matches → list joined contests → save as `Match.contestUrl`). The picker is
available to **anyone with `results.manage`**, not just the superadmin. The
underlying server actions in `actions/admin.ts`
(`checkMy11SessionAction`, `listMy11MatchesAction`,
`listMy11ContestsAction`) gate on `results.manage`. The shared My11 cookie
itself is still synced by the superadmin's Chrome extension.

## Result entry safeguards

- Per match, one `MatchResult` per user. Re-running scoring deletes previous rows for that match and recomputes.
- Bonuses re-apply with the **current** `Settings.bonusConfig` and `customBonuses[]` — useful after tweaks.
- Always cap awarded bonuses at `MAX_BONUS_PER_MATCH` (or admin-overridden value).
- `BonusAuditLog` is wiped + reinserted per regen so the AI narrator sees the new reasons.
