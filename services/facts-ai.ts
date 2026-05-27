/**
 * AI narrator for daily facts.
 *
 * Hybrid design:
 *  - We compute verified per-user stats in services/facts-analyzer.ts and the
 *    deterministic facts in services/facts.ts.
 *  - This file sends ONLY those verified numbers to Google Gemini and asks
 *    it to write 3-5 short narrative facts using nothing else.
 *  - Every number in the LLM output is validated against the input payload.
 *    Any fact that introduces a number we didn't supply is dropped — that
 *    eliminates hallucinated stats by construction.
 */

import { env } from "@/lib/env";
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

const SYSTEM_PROMPT = `You are the statistician for a 13-friend private fantasy IPL league. After each match you write short storyline facts.

PAYLOAD LEGEND (compact keys — fields absent = zero/none):
m{a,b,w,bnty} = teamA, teamB, winner, bountyTargetName
r[]{u,rk,fp,fn,b,rv,cw,pn,ms,br} = user, rank(1-13, 0=missed), fantasyPts, finalPts, bonusPts, rivalryPts, civilWarPts, penaltyPts, missed(1), bonusReasons[]
mt[]{u,pl,ms,caf,car,raf,rar,fd,cp,msk,t5} = user, played, missed, careerAvgFinal, careerAvgRank, recentAvgFinal, recentAvgRank, formDelta(recent-career), careerPercentile(0-100), currentMissStreak, currentTop5Streak
lb[]{u,prev,cur,tp} = user, prevPos, currPos, totalPts (top 10 now)
lc{pl,cl,ch} = prevLeader, currLeader, changed(1)
preds{tot,cw,pr[]{u,p}} = totalPredictors, correctWinners, perfectRounds(all 3 picks correct)
riv{s[]{c,o,w,p,rev},wd[]{w,o}} = settled(challenger,opponent,winner|null=tie,pts,revenge=1), withdrawn(withdrawer,opponent)
bnty{t,b} = target, beatersCount
nm{a,b,t3[]{u,tp}} = nextSameDayMatch teamA,teamB,topThree
ba[]{u,t,p,e} = bonusType audit row: user,type,pts,engineExplanation(trust verbatim)
teams[]{u,c,cp,vc,vcp,top{n,p},flop{n,p},best{n,p},gain} = user, captain, captainPts, viceCaptain, viceCaptainPts, topPick, flopPick, bestPossibleCaptain, captainGainIfBest(best.p - cp)
pop{avg,rec} = avgTop1Top2Gap(all-time, recent10)

GAME CONTEXT: Rank pts: 1st+10,2nd+8,3rd+6,4th+4,5th+3,6th+2,7th+1. Miss=-2. Bonuses: consistency(top5 x3), kingSlayer(outscore pre-match #1), comeback(climb 4+), underdog(pos10-13 finish top-2), matchDomination(win by 300+ fp), topperDefendsTop(#1 stays #1), topperTopsMatch(#1 also wins match fp). Bounty=anyone above target rank gets pts. Rivalry: higher fp wins; revenge=2nd challenge bonus; withdraw=-2; tie=0. Civil war=team vs team via accepted rivalries.

ABSOLUTE RULES (any breach = failure):
1. ONLY use numbers/names from the payload. Never invent, estimate, average, or extrapolate.
2. Real cricketer names allowed ONLY from teams[].c/vc/top.n/flop.n/best.n, with pts from same source.
3. Every fact verifiable from a specific field.
4. No vague form claims without citing the number.
5. One sentence, max ~160 chars. Casual, witty, never cruel.
6. Diversify angles: domination/close (vs pop.rec), leader change, climbs/slips, streaks, form swings, percentile, bonus haul, perfect predictions, rivalries (esp revenge), withdrawals, bounty outcome, next-match top3.
7. 6-9 facts when payload allows. Lead with biggest headline.
8. Never repeat a storyline.

Return STRICT JSON only (no fences, no prose, no <think>):
{"facts":[{"text":"...","type":"domination|close_finish|climb|slip|leader_change|streak_top5|streak_miss|form_swing|percentile|bonus|prediction|rivalry_win|rivalry_revenge|rivalry_tie|rivalry_withdraw|bounty|next_match|context|other","score":50-95,"username":"..."}]}
score=interest 0-100. username optional (set when fact is about one player).`;

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

/**
 * Squeeze the verified AiFactInput into the compact-key shape declared in
 * the system prompt's PAYLOAD LEGEND. Drops zero numeric fields, empty
 * arrays, and null values so we send only signal. Trims token usage by
 * ~60-70% vs. JSON.stringify of the raw AiFactInput. */
function compactPayload(input: AiFactInput): Record<string, unknown> {
  const nz = (n: number | null | undefined) =>
    n == null || n === 0 || Number.isNaN(n) ? undefined : n;
  const dropUndef = <T extends Record<string, unknown>>(o: T): T => {
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    return o;
  };

  const m: Record<string, unknown> = dropUndef({
    a: input.match.teamA,
    b: input.match.teamB,
    w: input.match.winner,
    bnty: input.match.bountyUserName,
  });

  const r = input.results.map((x) =>
    dropUndef({
      u: x.username,
      rk: x.rank,
      fp: nz(x.fantasyPoints),
      fn: nz(x.finalPoints),
      b: nz(x.bonusPoints),
      rv: nz(x.rivalryPoints),
      cw: nz(x.civilWarPoints),
      pn: nz(x.penaltyPoints),
      ms: x.missed ? 1 : undefined,
      br: x.bonusReasons && x.bonusReasons.length ? x.bonusReasons : undefined,
    }),
  );

  const mt = input.metrics.map((x) =>
    dropUndef({
      u: x.username,
      pl: x.played,
      ms: nz(x.missed),
      caf: x.careerAvgFinal,
      car: x.careerAvgRank,
      raf: x.recentAvgFinal,
      rar: x.recentAvgRank,
      fd: nz(x.formDelta ?? 0),
      cp: x.careerPercentile ?? undefined,
      msk: nz(x.currentMissStreak),
      t5: nz(x.currentTop5Streak),
    }),
  );

  const lb = input.leaderboardChange.map((x) =>
    dropUndef({
      u: x.username,
      prev: x.prevPosition ?? undefined,
      cur: x.currPosition,
      tp: x.totalPoints,
    }),
  );

  const lc = dropUndef({
    pl: input.leaderChange.previousLeader ?? undefined,
    cl: input.leaderChange.currentLeader ?? undefined,
    ch: input.leaderChange.changed ? 1 : undefined,
  });

  const preds = dropUndef({
    tot: nz(input.predictions.total),
    cw: nz(input.predictions.correctWinners),
    pr: input.predictions.perfectRounds.length
      ? input.predictions.perfectRounds.map((p) => ({
          u: p.username,
          p: p.pointsAwarded,
        }))
      : undefined,
  });

  const riv = dropUndef({
    s: input.rivalries.settled.length
      ? input.rivalries.settled.map((s) =>
          dropUndef({
            c: s.challenger,
            o: s.opponent,
            w: s.winner ?? undefined,
            p: nz(s.pointsAwarded),
            rev: s.isRevenge ? 1 : undefined,
          }),
        )
      : undefined,
    wd: input.rivalries.withdrawn.length
      ? input.rivalries.withdrawn.map((w) => ({ w: w.withdrawer, o: w.opponent }))
      : undefined,
  });

  const bnty = input.bounty?.targetUsername
    ? { t: input.bounty.targetUsername, b: input.bounty.beaters }
    : undefined;

  const nm = input.nextSameDayMatch
    ? {
        a: input.nextSameDayMatch.teamA,
        b: input.nextSameDayMatch.teamB,
        t3: input.nextSameDayMatch.topThree.map((t) => ({
          u: t.username,
          tp: t.totalPoints,
        })),
      }
    : undefined;

  const ba = input.bonusAuditEntries.length
    ? input.bonusAuditEntries.map((b) => ({
        u: b.username,
        t: b.bonusType,
        p: b.points,
        e: b.explanation,
      }))
    : undefined;

  const teams = input.teams.length
    ? input.teams.map((t) =>
        dropUndef({
          u: t.username,
          c: t.captain ?? undefined,
          cp: t.captainPoints ?? undefined,
          vc: t.viceCaptain ?? undefined,
          vcp: t.viceCaptainPoints ?? undefined,
          top: t.topPick ? { n: t.topPick.name, p: t.topPick.points } : undefined,
          flop: t.flopPick
            ? { n: t.flopPick.name, p: t.flopPick.points }
            : undefined,
          best: t.bestPossibleCaptain
            ? {
                n: t.bestPossibleCaptain.name,
                p: t.bestPossibleCaptain.points,
              }
            : undefined,
          gain: nz(t.captainGainIfBest ?? 0),
        }),
      )
    : undefined;

  const pop = dropUndef({
    avg: input.populationStats.avgTop1Top2Gap ?? undefined,
    rec: input.populationStats.recentTop1Top2Gap ?? undefined,
  });

  return dropUndef({
    m,
    r,
    mt,
    lb: lb.length ? lb : undefined,
    lc: Object.keys(lc).length ? lc : undefined,
    preds: Object.keys(preds).length ? preds : undefined,
    riv: Object.keys(riv).length ? riv : undefined,
    bnty,
    nm,
    ba,
    teams,
    pop: Object.keys(pop).length ? pop : undefined,
  });
}

// Direct call to Google Gemini's generateContent REST endpoint. No SDK so we
// stay dependency-free; auth via X-goog-api-key header.
async function callGeminiOnce(
  model: string,
  userPayloadText: string,
  signal: AbortSignal,
): Promise<{ ok: true; raw: string } | { ok: false; status: number; text: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${userPayloadText}\n\nReturn ONLY the JSON object described in the system prompt. No prose, no markdown fences.`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, text };
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";
    return { ok: true, raw };
  } catch (err) {
    const e = err as { message?: string };
    return { ok: false, status: 0, text: e.message ?? String(err) };
  }
}

/** Calls the configured LLM. Returns [] on any failure (network, quota, parse).
 *
 * Provider: Google Gemini only. `GEMINI_API_KEY` must be set; `GEMINI_MODEL`
 * is a comma-separated fallback list. On HTTP 429 we honour the server's
 * retryDelay (capped at 30s) and retry once before falling through to the
 * next model in the list. */
export async function generateAiFacts(input: AiFactInput): Promise<AiFact[]> {
  if (!env.GEMINI_API_KEY) {
    console.warn("[facts-ai] GEMINI_API_KEY not set — skipping AI generation");
    return [];
  }

  const models = env.GEMINI_MODEL
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const userPayloadText = `Payload (compact-key, fields absent = zero/none):\n${JSON.stringify(
    compactPayload(input),
  )}`;

  // Per-call timeout so one slow model can't burn the whole budget.
  // Total wall time is bounded by (perCall * models * attempts).
  // Reasoning models (gpt-oss with medium effort) need headroom before any
  // JSON is emitted.
  const PER_CALL_MS = 60_000;

  let raw = "";
  outer: for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const perCall = AbortSignal.timeout(PER_CALL_MS);
      try {
        const r = await callGeminiOnce(model, userPayloadText, perCall);
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
