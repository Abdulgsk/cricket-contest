# AI daily facts

Goal: post-match storyline blurbs for the dashboard (e.g., "Mithun captained Rohit (28 pts) — captaining his own top pick Bumrah would've netted +50.").

## Two-stage design

`services/facts.ts` → `services/facts-analyzer.ts` → `services/facts-ai.ts`.

1. **Analyzer** (`facts-analyzer.ts`) — computes verified per-user season stats from `MatchResult` history (career/recent averages, miss/top5 streaks, percentile, leaderboard movement gap stats). Pure math, no AI.
2. **Builder** (`facts.ts::generateFactsForMatch`) — gathers everything the model needs: results, snapshot, leaderboard diff, predictions, rivalries, bounty, nextSameDayMatch, BonusAuditLog entries, **per-user Dream11 team breakdowns** (captain/VC/topPick/flopPick/bestPossibleCaptain/captainGainIfBest).
3. **AI narrator** (`facts-ai.ts::generateAiFacts`) — sends the verified payload to the LLM with a strict system prompt; validates the output.

## Anti-hallucination guarantee

`facts-ai.ts::validateFacts`:

- Builds `allowedNums` from the payload (rounded to 1dp + integer form + absolute values).
- Builds `allowedNames` from every username + every cricketer name that appears in `teams[].captain/viceCaptain/topPick/flopPick/bestPossibleCaptain`.
- For every fact emitted:
  - Extract every number-like token. Always allow `0..13` as universal phrasing (ranks, positions). Reject if a number isn't in `allowedNums`.
  - If `f.username` is set, it must exist in `allowedNames`.
- Facts that fail validation are **dropped** (not retried). This is the design — better to ship fewer facts than wrong ones.

## Provider

`generateAiFacts()` calls **Hugging Face Router** only (OpenAI-compatible API at `https://router.huggingface.co/v1`). Requires `HF_TOKEN`; `HF_MODEL` is a comma-separated fallback list (default `deepseek-ai/DeepSeek-R1:novita,meta-llama/Llama-3.3-70B-Instruct:novita`). DeepSeek-R1 emits `<think>` reasoning which is stripped before parsing.

- Iterate the comma-separated model list.
- Per model: 2 attempts. On HTTP 429 honour the server's `retryDelay` (capped at 30s) before retry. On any other error fall through to the next model.
- Per-call timeout: 60s.

Empty response or unparseable JSON → `generateFactsForMatch` returns `{written:0, error}` and the previous batch stays on the dashboard. The admin "Regenerate" toast surfaces the reason.

## System prompt rules (highlights)

- Only use numbers/names from the payload — no estimating, no extrapolating, no real-world cricket facts EXCEPT cricketer names sourced from `teams[]`.
- Each fact ≤ ~160 chars, casual tone "like a friend in the group chat".
- 6-9 facts when material allows; lead with highest-impact storyline.
- Diversify across: domination/closeness, leader change, climbs/slips, streaks, form swings, percentile milestones, bonus reasons, perfect prediction rounds, settled/revenge/withdrawn rivalries, bounty outcome, top-3 heading into nextSameDayMatch.

## Storage

- `DailyFact` collection. Append-only — every regeneration gets a new `batchNumber` per match.
- Dashboard reads via `services/facts.ts::getLatestFacts(limit)` — newest batch of the newest match only.
- Older batches stay for history/debugging.

## Admin entry point

- Admin → Operations → "Regenerate" button (component: `components/admin/regenerate-facts-button.tsx`). Useful when adding new payload fields or after fixing bonus logic.
