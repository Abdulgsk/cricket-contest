# Civil War

Rivalry-driven team battles attached to each match.

## Membership

- Driven by **accepted rivalries**. As rivalries are accepted, both players are auto-added to that match's `CivilWar.members[]`.
- Hard constraint: the two members of a rivalry must always be on **opposite sides**.
- `CIVIL_WAR_MIN_RIVALRIES = 2` — fewer than 2 accepted rivalries → no Civil War computed.

## Side randomization

`services/civil-war.ts::randomizeCivilWarSides(members)`:

Old algorithm was incremental — first rivalry was randomly placed, subsequent ones inherited their existing partner's side. This biased the lineup: a player who issued multiple challenges always ended up with all their rivals on the opposite side ("challengers vs acceptors" clustering).

New algorithm runs after every attach/detach:

1. Build adjacency: each rivalry's two members are an edge.
2. BFS each connected component; **pick the starting side at random per component**.
3. Within each component the 2-coloring is forced (BFS alternates A/B), preserving the hard constraint.
4. Orphans (members with no rivalry partner present) get a coin flip.

The UI shows each user across from their rival exactly as before — only which side any given cluster lands on is now truly random.

## Captains

`services/civil-war.ts::pickCaptains(members, prevLeaderboardOrder, excludeMatchId)`:

- Per side: pick the member with the **highest pre-match leaderboard position** (lowest rank #).
- Tiebreak: most recent settled match's `fantasyPoints` higher.
- Final fallback: alphabetical by username.

## Outcome computation

`services/civil-war.ts::computeCivilWarOutcome()`:

- `teamAWinners` / `teamBWinners` — count of 1v1 rivalries won per side
- `teamAFp` / `teamBFp` — sum of fantasy points per side
- Outcomes (in priority order):
  - `A_decisive` — A wins both 1v1 count AND FP
  - `A_split` — A wins 1v1 count but loses FP (still wins)
  - `A_fp_tiebreak` — 1v1 count tied, A wins on FP
  - same with B
  - `draw` — 1v1s tied AND FP tied
  - `not_eligible` — < `CIVIL_WAR_MIN_RIVALRIES`
- Decisive > Split > FP-tiebreak (in payout magnitude). Configured via `Settings.civilWarConfig.{decisiveWin, decisiveLoss, splitWin, splitLoss}`.

## Bonus interactions

- **Captain's team win** (`CAPTAIN_TEAM_WIN`, default +1) — every member of the side whose captain has higher fantasy points than the opposing captain gets the bonus.
- **Leader Topper override** (`LEADER_TOPPER_BONUS`, default +1) — if the overall leaderboard #1 isn't in this match's Civil War but outscores BOTH captains in fantasy points, they get the bonus instead.

## Display

- `lib/civil-war-breakdown.ts` — pure functions returning per-user breakdown rows (rivalry result, civil-war delta, captain bonus).
- `app/api/civil-war/[matchId]/live` — live polling endpoint while match is live.
- Admin settings: `components/admin/civil-war-settings-panel.tsx`, gated by `civilwar.points.manage`.
