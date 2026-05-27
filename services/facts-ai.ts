/**
 * AI narrator for daily facts.
 *
 * Hybrid design:
 *  - We compute verified per-user stats in services/facts-analyzer.ts and the
 *    deterministic facts in services/facts.ts.
 *  - This file sends ONLY those verified numbers to a Hugging Face model and
 *    asks it to write 3-5 short narrative facts using nothing else.
 *  - Every number in the LLM output is validated against the input payload.
 *    Any fact that introduces a number we didn't supply is dropped — that
 *    eliminates hallucinated stats by construction.
 */

import { env } from "@/lib/env";
import OpenAI from "openai";
import type { UserMetrics, AnalyzerSnapshot } from "@/services/facts-analyzer";
import type { LeaderboardRow } from "@/services/scoring";

export interface AiFactInput {
  match: {
    teamA: string;
    teamB: string;
    winner?: string;
    bountyUserName?: string;
  };
  results: Array<{
    username: string;
    rank: number;
    fantasyPoints: number;
    finalPoints: number;
    bonusPoints: number;
    rivalryPoints: number;
    civilWarPoints: number;
    penaltyPoints: number;
    missed: boolean;
    bonusReasons?: string[];
  }>;
  metrics: Array<{
    username: string;
    played: number;
    missed: number;
    careerAvgFinal: number;
    careerAvgRank: number;
    recentAvgFinal: number;
    recentAvgRank: number;
    formDelta: number | null;
    careerPercentile: number | null;
    currentMissStreak: number;
    currentTop5Streak: number;
  }>;
  leaderboardChange: Array<{
    username: string;
    prevPosition: number | null;
    currPosition: number;
    totalPoints: number;
  }>;
  leaderChange: {
    previousLeader: string | null;
    currentLeader: string | null;
    changed: boolean;
  };
  predictions: {
    total: number;
    correctWinners: number;
    perfectRounds: Array<{ username: string; pointsAwarded: number }>;
  };
  rivalries: {
    settled: Array<{
      challenger: string;
      opponent: string;
      winner: string | null;
      pointsAwarded: number;
      isRevenge: boolean;
    }>;
    withdrawn: Array<{ withdrawer: string; opponent: string }>;
  };
  bounty: {
    targetUsername: string | null;
    beaters: number;
  } | null;
  nextSameDayMatch: {
    teamA: string;
    teamB: string;
    topThree: Array<{ username: string; totalPoints: number }>;
  } | null;
  /** One row per granted bonus this match (from BonusAuditLog) — gives the
   * model the human-readable "why" behind every bonus point. */
  bonusAuditEntries: Array<{
    username: string;
    bonusType: string;
    points: number;
    explanation: string;
  }>;
  /** Per-user Dream11 team breakdown (only users who had a mapped team).
   * The model can use these to narrate WHY someone scored what they did:
   * captain/VC choice, top pick, biggest flop, what they would have scored
   * had they captained the highest scorer in their own team. */
  teams: Array<{
    username: string;
    captain: string | null;
    captainPoints: number | null;
    viceCaptain: string | null;
    viceCaptainPoints: number | null;
    topPick: { name: string; points: number } | null;
    flopPick: { name: string; points: number } | null;
    bestPossibleCaptain: { name: string; points: number } | null;
    captainGainIfBest: number | null;
  }>;
  populationStats: {
    avgTop1Top2Gap: number | null;
    recentTop1Top2Gap: number | null;
  };
}

export interface AiFact {
  text: string;
  type: string;
  score: number;
  username?: string;
}

/** Round to 1 dp so the LLM and our validator compare apples-to-apples. */
function r(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildAiInput(args: {
  match: { teamA: string; teamB: string; winner?: string; bountyUserName?: string };
  results: Array<{
    userId: string;
    rank: number;
    fantasyPoints: number;
    finalPoints: number;
    bonusPoints: number;
    rivalryPoints: number;
    civilWarPoints: number;
    penaltyPoints: number;
    missed: boolean;
    bonusReasons?: string[];
  }>;
  snapshot: AnalyzerSnapshot;
  prevLb: LeaderboardRow[];
  currLb: LeaderboardRow[];
  nameMap: Map<string, string>;
  predictions: {
    total: number;
    correctWinners: number;
    perfectRounds: Array<{ username: string; pointsAwarded: number }>;
  };
  rivalries: {
    settled: Array<{
      challenger: string;
      opponent: string;
      winner: string | null;
      pointsAwarded: number;
      isRevenge: boolean;
    }>;
    withdrawn: Array<{ withdrawer: string; opponent: string }>;
  };
  bounty: { targetUsername: string | null; beaters: number } | null;
  nextSameDayMatch: {
    teamA: string;
    teamB: string;
    topThree: Array<{ username: string; totalPoints: number }>;
  } | null;
  bonusAuditEntries: Array<{
    username: string;
    bonusType: string;
    points: number;
    explanation: string;
  }>;
  teams: AiFactInput["teams"];
}): AiFactInput {
  const {
    match,
    results,
    snapshot,
    prevLb,
    currLb,
    nameMap,
    predictions,
    rivalries,
    bounty,
    nextSameDayMatch,
    bonusAuditEntries,
    teams,
  } = args;
  const prevPosById = new Map(prevLb.map((r) => [String(r.userId), r.position]));

  const enrichedResults = results
    .map((r0) => ({
      username: nameMap.get(r0.userId) ?? "Unknown",
      rank: r0.rank,
      fantasyPoints: r(r0.fantasyPoints),
      finalPoints: r(r0.finalPoints),
      bonusPoints: r(r0.bonusPoints),
      rivalryPoints: r(r0.rivalryPoints),
      civilWarPoints: r(r0.civilWarPoints),
      penaltyPoints: r(r0.penaltyPoints),
      missed: r0.missed,
      bonusReasons: r0.bonusReasons,
    }))
    .sort((a, b) => (a.missed ? 1 : 0) - (b.missed ? 1 : 0) || a.rank - b.rank);

  const enrichedMetrics: AiFactInput["metrics"] = [];
  for (const [uid, m] of snapshot.metrics.entries()) {
    const username = nameMap.get(uid);
    if (!username) continue;
    enrichedMetrics.push({
      username,
      played: m.played,
      missed: m.missed,
      careerAvgFinal: r(m.career.avgFinal),
      careerAvgRank: r(m.career.avgRank),
      recentAvgFinal: r(m.recent.avgFinal),
      recentAvgRank: r(m.recent.avgRank),
      formDelta: m.formDelta == null ? null : r(m.formDelta),
      careerPercentile: m.careerPercentile,
      currentMissStreak: m.currentMissStreak,
      currentTop5Streak: m.currentTop5Streak,
    });
  }

  const lbChange: AiFactInput["leaderboardChange"] = [];
  for (const c of currLb.slice(0, 10)) {
    const uid = String(c.userId);
    const username = nameMap.get(uid) ?? c.username;
    lbChange.push({
      username,
      prevPosition: prevPosById.get(uid) ?? null,
      currPosition: c.position,
      totalPoints: r(c.totalPoints),
    });
  }

  const prevLeaderUid = prevLb[0] ? String(prevLb[0].userId) : null;
  const currLeaderUid = currLb[0] ? String(currLb[0].userId) : null;
  const leaderChange: AiFactInput["leaderChange"] = {
    previousLeader: prevLeaderUid
      ? nameMap.get(prevLeaderUid) ?? prevLb[0].username
      : null,
    currentLeader: currLeaderUid
      ? nameMap.get(currLeaderUid) ?? currLb[0].username
      : null,
    changed:
      !!prevLeaderUid && !!currLeaderUid && prevLeaderUid !== currLeaderUid,
  };

  return {
    match,
    results: enrichedResults,
    metrics: enrichedMetrics,
    leaderboardChange: lbChange,
    leaderChange,
    predictions: {
      total: predictions.total,
      correctWinners: predictions.correctWinners,
      perfectRounds: predictions.perfectRounds.map((p) => ({
        username: p.username,
        pointsAwarded: r(p.pointsAwarded),
      })),
    },
    rivalries: {
      settled: rivalries.settled.map((s) => ({
        challenger: s.challenger,
        opponent: s.opponent,
        winner: s.winner,
        pointsAwarded: r(s.pointsAwarded),
        isRevenge: s.isRevenge,
      })),
      withdrawn: rivalries.withdrawn,
    },
    bounty,
    nextSameDayMatch: nextSameDayMatch
      ? {
          teamA: nextSameDayMatch.teamA,
          teamB: nextSameDayMatch.teamB,
          topThree: nextSameDayMatch.topThree.map((t) => ({
            username: t.username,
            totalPoints: r(t.totalPoints),
          })),
        }
      : null,
    bonusAuditEntries: bonusAuditEntries.map((b) => ({
      username: b.username,
      bonusType: b.bonusType,
      points: r(b.points),
      explanation: b.explanation,
    })),
    teams: teams.map((t) => ({
      username: t.username,
      captain: t.captain,
      captainPoints: t.captainPoints == null ? null : r(t.captainPoints),
      viceCaptain: t.viceCaptain,
      viceCaptainPoints:
        t.viceCaptainPoints == null ? null : r(t.viceCaptainPoints),
      topPick: t.topPick
        ? { name: t.topPick.name, points: r(t.topPick.points) }
        : null,
      flopPick: t.flopPick
        ? { name: t.flopPick.name, points: r(t.flopPick.points) }
        : null,
      bestPossibleCaptain: t.bestPossibleCaptain
        ? {
            name: t.bestPossibleCaptain.name,
            points: r(t.bestPossibleCaptain.points),
          }
        : null,
      captainGainIfBest:
        t.captainGainIfBest == null ? null : r(t.captainGainIfBest),
    })),
    populationStats: {
      avgTop1Top2Gap:
        snapshot.avgTop1Top2Gap == null ? null : r(snapshot.avgTop1Top2Gap),
      recentTop1Top2Gap:
        snapshot.recentTop1Top2Gap == null ? null : r(snapshot.recentTop1Top2Gap),
    },
  };
}

const SYSTEM_PROMPT = `You are the in-house statistician for "Cricket Contest", a private fantasy cricket league played by a fixed group of 13 friends across the IPL season. Each match they all submit a Dream11 team; results are entered after the real match finishes. You write the daily storyline facts shown to members after a match is scored. You are the SOLE source of these facts.

==================================================
HOW THE GAME WORKS — read this so your facts make sense
==================================================
- 13 friends compete across the IPL season. Every match, each player submits one Dream11 fantasy team and gets a "fantasy score" (Dream11 points).
- Players are RANKED 1..13 within the match by fantasy score. Rank 0 = missed the match.
- Each match a player earns "final points" = base rank points + bonuses + bounty + rivalry + civil-war + penalties. The season leaderboard sums final points.

Rank points (fixed): 1st=+10, 2nd=+8, 3rd=+6, 4th=+4, 5th=+3, 6th=+2, 7th=+1, 8th-13th=0.

Penalties:
- Missed match: -2 (and your fantasy points for that match are 0).
- 2 consecutive misses: extra -1. 3 in a row: extra -2 more.

Bonuses (capped per match — admin-tuned, but assume these defaults if needed for context, never invent values):
- Consistency: top-5 by fantasy points in 3 matches in a row.
- King Slayer: outscore the player who was leaderboard #1 before this match.
- Comeback: jump 4+ places on the leaderboard after this match.
- Underdog: pre-match position 10-13 AND finish top-2 in this match.
- Match Domination: win the match by 300+ fantasy points over 2nd.
- Topper Defends Top: pre-match #1 stays #1.
- Topper Tops Match: pre-match #1 also wins this match's fantasy points.
- Captain's team wins: every Civil War team has a "captain" (highest leaderboard player on that side). The captain who scores more fantasy points this match wins it for their whole team.
- Leader Topper override: overall #1 outscores BOTH civil-war captains.

Bounty: admins pick a bounty target per match. Anyone who finishes ABOVE the bounty target by rank gets +bounty points. The target loses nothing — surviving is just bragging rights.

Rivalries (1v1):
- A player can challenge any other player for a specific match.
- Once a rivalry is "accepted" and the match is scored, the higher fantasy-point scorer wins → +rivalry points.
- A "revenge" rivalry is the SECOND time you challenge the same player; winning it adds an extra revenge bonus.
- Withdrawing an accepted rivalry before lock costs -2.
- A "tie" rivalry awards no rivalry points.

Civil War (team vs team):
- When rivalries get accepted for a match, the players are split into Team A vs Team B (kept secret until match start). Need 2+ accepted rivalries to run.
- Team that wins more 1v1s wins the Civil War. Tiebreaker = combined fantasy points. Decisive (both metrics) > Split (only 1v1s) > FP-tiebreak.
- Winning team gets +civilWarPoints, losing team gets -civilWarPoints. A pure draw = 0/0.

Predictions: each match every player can predict (a) match winner, (b) top batter, (c) top bowler. Each correct = a few points; getting all three right = bonus on top.

Special match modes that may apply: 2x Points (doubles rank points), No Bonus (zeros bonuses), Chaos (bonuses doubled), Prediction Madness (prediction points doubled).

==================================================
HOW TO READ THE PAYLOAD
==================================================
- "results": THIS match. fantasyPoints = Dream11 score. finalPoints = total after all rules above. rank = 1..13 (0 if missed).
- "metrics": per-player season-to-date snapshot.
  - careerAvgFinal = average final points across all matches they have played (excluding misses).
  - recentAvgFinal = same but only last 5 matches.
  - formDelta = recentAvgFinal - careerAvgFinal (positive = trending up, negative = slumping).
  - careerPercentile = where their careerAvgFinal sits vs the league (0=worst, 100=best).
  - currentTop5Streak / currentMissStreak = consecutive count up to and INCLUDING this match.
- "leaderboardChange": top 10 NOW, with their previous position. prevPosition - currPosition = places climbed.
- "leaderChange": who was overall #1 before vs after this match.
- "predictions.perfectRounds": players who got all 3 picks correct this match.
- "rivalries.settled": all 1v1s decided this match. winner=null means tie. isRevenge=true means it was a revenge rematch.
- "rivalries.withdrawn": players who bailed on a rivalry (incurred penalty).
- "bounty": who was the target and how many beat them (beaters=0 means target survived).
- "nextSameDayMatch": if there is another match later TODAY, this is the current top-3 — useful to set up "watch out for X" stories.
- "bonusAuditEntries": one row per bonus actually awarded this match, with the engine's own "explanation" string. Use these to narrate WHY a bonus was awarded (e.g. "earned the King Slayer for outscoring pre-match #1 by 18 fantasy points"). Trust the explanation strings verbatim — they are the ground truth from the scoring engine.
- "populationStats.recentTop1Top2Gap": average winning margin across the last 10 matches — use it as the bar for whether tonight's win counts as "dominant" or "tight".
- "teams": ONLY the players who had a Dream11 team mapped for this match (some users won't appear). Each entry exposes the actual cricketer they captained, vice-captained, the top fantasy scorer in their 11, the biggest flop they picked, and what their captaincy would have been worth if they had captained their own top pick (captainGainIfBest = bestPossibleCaptain.points - captainPoints, both at 1x). Use this to narrate captaincy decisions, e.g. "Mithun's captain pick (Rohit, 28 fantasy pts) cost him 50 fantasy pts versus captaining his own top scorer Bumrah". Only the cricketer NAMES from these team entries are valid IPL-player names you may quote in facts.

==================================================
ABSOLUTE RULES — breaking any of these is failure
==================================================
1. You may ONLY use numbers and names that appear in the JSON payload. Do not invent, estimate, average, or extrapolate any number — even if it seems obvious.
2. Do NOT mention real IPL players, real teams' actual cricket stats, or real-world cricket events EXCEPT when narrating a user's own Dream11 picks (captain, vice-captain, topPick, flopPick, bestPossibleCaptain) from the "teams" payload. The fantasy-player names in "teams" are the ONLY real cricketer names you may use, and you may only quote their fantasy point values from that payload.
3. Every fact must be VERIFIABLE from a specific field. If you can't point to it, do not write it.
4. No vague form claims like "in great form lately" without citing the supporting number (e.g. "recentAvgFinal is 25 above their career mark").
5. Keep each fact to one sentence, max ~160 chars. Casual, witty, like a friend in the group chat — but never cruel.
6. Diversify angles. Cover the most interesting storylines from this list when the payload supports them: match domination/closeness (vs recentTop1Top2Gap), leader change, big climbs/slips, top-5 or miss streaks, form swings, percentile milestones, biggest bonus haul, perfect prediction rounds, total correct winners, settled rivalries (esp. revenge wins), withdrawn rivalries, bounty outcome, top-3 heading into nextSameDayMatch.
7. Aim for 6-9 facts when material allows; fewer is fine if the payload is thin. Lead with the highest-impact storyline.
8. Never write a fact that another fact already covered.

Return STRICT JSON only (no markdown fences, no commentary):
{
  "facts": [
    { "text": "...", "type": "domination|close_finish|climb|slip|leader_change|streak_top5|streak_miss|form_swing|percentile|bonus|prediction|rivalry_win|rivalry_revenge|rivalry_tie|rivalry_withdraw|bounty|next_match|context|other", "score": 50-95, "username": "..." }
  ]
}

"score" = your interest level 0-100 (higher = bigger headline). "username" optional — set it when the fact is about one player.`;

/** Parses the model's JSON output, tolerating ```json fences. */
function parseModelJson(raw: string): { facts?: AiFact[] } | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract the first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Build the set of every number that appeared in the input payload (rounded
 * to 1dp + integer form). Used to reject facts containing fabricated stats.
 */
function collectAllowedNumbers(input: AiFactInput): Set<string> {
  const set = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n == null || Number.isNaN(n)) return;
    set.add(String(Math.round(n)));
    set.add(String(Math.round(n * 10) / 10));
    // Also allow absolute value (e.g. negative formDelta phrased as "down 12")
    set.add(String(Math.abs(Math.round(n))));
    set.add(String(Math.abs(Math.round(n * 10) / 10)));
  };
  for (const r of input.results) {
    add(r.rank);
    add(r.fantasyPoints);
    add(r.finalPoints);
    add(r.bonusPoints);
    add(r.rivalryPoints);
    add(r.civilWarPoints);
    add(r.penaltyPoints);
  }
  for (const m of input.metrics) {
    add(m.played);
    add(m.missed);
    add(m.careerAvgFinal);
    add(m.careerAvgRank);
    add(m.recentAvgFinal);
    add(m.recentAvgRank);
    add(m.formDelta);
    add(m.careerPercentile);
    add(m.currentMissStreak);
    add(m.currentTop5Streak);
  }
  for (const c of input.leaderboardChange) {
    add(c.prevPosition);
    add(c.currPosition);
    add(c.totalPoints);
  }
  for (const p of input.predictions.perfectRounds) add(p.pointsAwarded);
  add(input.predictions.total);
  add(input.predictions.correctWinners);
  for (const s of input.rivalries.settled) add(s.pointsAwarded);
  for (const b of input.bonusAuditEntries) add(b.points);
  if (input.bounty) add(input.bounty.beaters);
  for (const t of input.teams) {
    add(t.captainPoints);
    add(t.viceCaptainPoints);
    if (t.topPick) add(t.topPick.points);
    if (t.flopPick) add(t.flopPick.points);
    if (t.bestPossibleCaptain) add(t.bestPossibleCaptain.points);
    add(t.captainGainIfBest);
  }
  if (input.nextSameDayMatch) {
    for (const t of input.nextSameDayMatch.topThree) add(t.totalPoints);
  }
  add(input.populationStats.avgTop1Top2Gap);
  add(input.populationStats.recentTop1Top2Gap);
  return set;
}

/**
 * Reject facts that mention numbers not present in the input payload, or
 * usernames that don't exist. This is the anti-hallucination guard.
 */
function validateFacts(facts: AiFact[], input: AiFactInput): AiFact[] {
  const allowedNums = collectAllowedNumbers(input);
  const allowedNames = new Set(input.metrics.map((m) => m.username));
  for (const r of input.results) allowedNames.add(r.username);
  for (const c of input.leaderboardChange) allowedNames.add(c.username);
  for (const p of input.predictions.perfectRounds) allowedNames.add(p.username);
  for (const s of input.rivalries.settled) {
    allowedNames.add(s.challenger);
    allowedNames.add(s.opponent);
    if (s.winner) allowedNames.add(s.winner);
  }
  for (const w of input.rivalries.withdrawn) {
    allowedNames.add(w.withdrawer);
    allowedNames.add(w.opponent);
  }
  if (input.bounty?.targetUsername) allowedNames.add(input.bounty.targetUsername);
  if (input.nextSameDayMatch) {
    for (const t of input.nextSameDayMatch.topThree) allowedNames.add(t.username);
  }
  if (input.leaderChange.previousLeader)
    allowedNames.add(input.leaderChange.previousLeader);
  if (input.leaderChange.currentLeader)
    allowedNames.add(input.leaderChange.currentLeader);
  for (const b of input.bonusAuditEntries) allowedNames.add(b.username);
  // Allow the cricketer names from team picks too — these are real IPL players
  // and we explicitly let the model quote them.
  for (const t of input.teams) {
    allowedNames.add(t.username);
    if (t.captain) allowedNames.add(t.captain);
    if (t.viceCaptain) allowedNames.add(t.viceCaptain);
    if (t.topPick) allowedNames.add(t.topPick.name);
    if (t.flopPick) allowedNames.add(t.flopPick.name);
    if (t.bestPossibleCaptain) allowedNames.add(t.bestPossibleCaptain.name);
  }

  const out: AiFact[] = [];
  for (const f of facts) {
    if (!f || typeof f.text !== "string" || !f.text.trim()) continue;
    const text = f.text;

    // Extract every number-like token (handles "+12", "-3.5", "85.0", "3rd")
    const nums = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
    let ok = true;
    for (const tok of nums) {
      // Always allow common ordinal/positional small ints that are universal phrasing
      const n = Number(tok);
      if (Number.isInteger(n) && n >= 0 && n <= 13) continue;
      const norm = String(Math.round(n * 10) / 10);
      const intNorm = String(Math.round(n));
      if (!allowedNums.has(norm) && !allowedNums.has(intNorm)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // If a username is claimed, it must exist
    if (f.username && !allowedNames.has(f.username)) continue;

    out.push({
      text: text.trim(),
      type: typeof f.type === "string" ? f.type : "ai_insight",
      score: Number.isFinite(f.score) ? Math.max(40, Math.min(95, f.score)) : 70,
      username: f.username,
    });
  }
  return out;
}

/** Extracts the server's suggested retry delay (seconds) from a 429 body, if any. */
function parseRetryDelaySeconds(body: string): number | null {
  // Some providers return a RetryInfo block with retryDelay: "8s" in the JSON.
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (m) return Math.min(30, Math.ceil(Number(m[1])));
  // Fallback: free-text "Please retry in 8.86s."
  const m2 = body.match(/retry in\s+(\d+(?:\.\d+)?)s/i);
  if (m2) return Math.min(30, Math.ceil(Number(m2[1])));
  return null;
}

// Lazily-initialised OpenAI client pointed at Hugging Face Router.
let hfClient: OpenAI | null = null;
function getHfRouter(): OpenAI {
  if (!hfClient) {
    hfClient = new OpenAI({
      baseURL: "https://router.huggingface.co/v1",
      apiKey: env.HF_TOKEN,
    });
  }
  return hfClient;
}

async function callHfRouterOnce(
  model: string,
  userPayloadText: string,
  signal: AbortSignal
): Promise<{ ok: true; raw: string } | { ok: false; status: number; text: string }> {
  try {
    const completion = await getHfRouter().chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${userPayloadText}\n\nReturn ONLY the JSON object described in the system prompt. No prose, no markdown fences, no <think> blocks.`,
          },
        ],
        temperature: 0.6,
        top_p: 0.9,
        // R1 emits <think> reasoning that counts against max_tokens. Give it
        // enough headroom to both think and write the full JSON.
        max_tokens: 4000,
      },
      { signal }
    );
    let raw = completion.choices?.[0]?.message?.content ?? "";
    // DeepSeek-R1 emits <think>...</think> reasoning before the answer.
    // Strip closed pairs first, then any unclosed/leftover opening tag
    // (can happen when output is truncated by max_tokens or timeout).
    raw = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*$/i, "")
      .replace(/^[\s\S]*?<\/think>/i, "")
      .trim();
    return { ok: true, raw };
  } catch (err) {
    const e = err as { status?: number; message?: string; error?: unknown };
    const status = typeof e.status === "number" ? e.status : 0;
    const text =
      typeof e.message === "string"
        ? e.message
        : JSON.stringify(e.error ?? err);
    return { ok: false, status, text };
  }
}

/** Calls the configured LLM. Returns [] on any failure (network, quota, parse).
 *
 * Provider: HF Router only. `HF_TOKEN` must be set; `HF_MODEL` is a
 * comma-separated fallback list. On HTTP 429 we honour the server's
 * retryDelay (capped at 30s) and retry once before falling through to the
 * next model in the list. */
export async function generateAiFacts(input: AiFactInput): Promise<AiFact[]> {
  if (!env.HF_TOKEN) {
    console.warn("[facts-ai] HF_TOKEN not set — skipping AI generation");
    return [];
  }

  const models = env.HF_MODEL
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const userPayloadText = `Match payload (the ONLY data you may use):\n\n${JSON.stringify(
    input,
    null,
    2
  )}`;

  // Per-call timeout so one slow model can't burn the whole budget.
  // Total wall time is bounded by (perCall * models * attempts).
  // HF DeepSeek-R1 needs more time because reasoning happens server-side
  // before any JSON is emitted.
  const PER_CALL_MS = 60_000;

  let raw = "";
  outer: for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const perCall = AbortSignal.timeout(PER_CALL_MS);
      try {
        const r = await callHfRouterOnce(model, userPayloadText, perCall);
        if (r.ok) {
          raw = r.raw;
          if (raw) break outer;
          // Empty response — try next model
          console.warn(`[facts-ai] empty response from ${model}`);
          break;
        }
        if (r.status === 429 && attempt === 0) {
          const delay = parseRetryDelaySeconds(r.text) ?? 5;
          console.warn(
            `[facts-ai] 429 on ${model}, retrying in ${delay}s`
          );
          await new Promise((res) => setTimeout(res, delay * 1000));
          continue; // retry same model
        }
        console.warn(`[facts-ai] http ${r.status} on ${model}`, r.text);
        break; // try next model
      } catch (err) {
        console.warn(`[facts-ai] call failed on ${model}`, err);
        break; // try next model
      }
    }
  }

  if (!raw) return [];
  const parsed = parseModelJson(raw);
  if (!parsed || !Array.isArray(parsed.facts)) return [];

  return validateFacts(parsed.facts, input);
}

// Type-only re-export for downstream consumers.
export type { UserMetrics };
