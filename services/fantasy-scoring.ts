// Pure Dream11-style T20 fantasy scoring. Takes a parsed Cricbuzz scorecard and
// produces per-player point breakdowns keyed by Cricbuzz profile id. No I/O, no
// DB — fully deterministic so it can be unit-reasoned about and re-run safely.
//
// All point values come from FANTASY_T20 in lib/constants.ts; nothing is
// hardcoded here. Captain / vice-captain multipliers are NOT applied here —
// that happens in the recompute step where we know each picked player's role.

import { FANTASY_T20, type FantasyRole } from "@/lib/constants";
import type { MatchScorecard } from "@/lib/scrapers/cricbuzz-scorecard";

/** A single labelled contribution to a player's fantasy points. */
export interface ScoreItem {
  label: string;
  points: number;
}

/** A run-out event that may need admin settlement (direct vs assisted). */
export interface RunOutEvent {
  /** Profile ids of the fielders credited (in scorecard order). */
  fielderIds: string[];
  /** What we assumed: a single fielder ⇒ direct hit, multiple ⇒ assisted. */
  assumedDirect: boolean;
  /** The dismissed batter, for admin context. */
  outBatterId: string;
}

/** Full fantasy score breakdown for one player across the whole match. */
export interface FantasyPlayerScore {
  id: string;
  name: string;
  total: number;
  items: ScoreItem[];
  /** Run-outs this player was involved in (for the admin review queue). */
  runOuts: RunOutEvent[];
}

interface Acc {
  id: string;
  name: string;
  items: ScoreItem[];
  catchCount: number;
  runOuts: RunOutEvent[];
}

function highestMilestoneBonus<T extends { bonus: number }>(
  tiers: readonly T[],
  reached: (t: T) => boolean
): T | null {
  // tiers are ordered high→low; first match is the highest reached.
  for (const t of tiers) if (reached(t)) return t;
  return null;
}

/** Economy-rate points for a bowler who bowled at least the minimum overs. */
function economyPoints(economy: number): number {
  for (const b of FANTASY_T20.economy.buckets) {
    if (economy < b.maxBelow) return b.points;
  }
  return 0;
}

/** Strike-rate points (non-bowlers) for a batter who faced the minimum balls. */
function strikeRatePoints(strikeRate: number): number {
  for (const b of FANTASY_T20.strikeRate.buckets) {
    if (strikeRate > b.minAbove) return b.points;
  }
  return 0;
}

/**
 * Compute fantasy points for every player who appears in the scorecard.
 *
 * @param scorecard parsed Cricbuzz scorecard
 * @param roles optional profileId → fantasy role map (picked players). Used for
 *   duck (only WK/BAT/AR) and strike-rate (non-bowlers). Unknown roles are
 *   treated as non-bowlers, which is correct for anyone who can actually be
 *   penalised — pure bowlers that matter are always picked and therefore known.
 */
export function computeFantasyScores(
  scorecard: MatchScorecard,
  roles?: Map<string, FantasyRole>
): Map<string, FantasyPlayerScore> {
  const accs = new Map<string, Acc>();
  const get = (id: string, name: string): Acc => {
    let a = accs.get(id);
    if (!a) {
      a = { id, name, items: [], catchCount: 0, runOuts: [] };
      accs.set(id, a);
    } else if (!a.name && name) {
      a.name = name;
    }
    return a;
  };

  const isBowlerRole = (id: string): boolean => roles?.get(id) === "BOWL";
  const B = FANTASY_T20.batting;
  const W = FANTASY_T20.bowling;
  const F = FANTASY_T20.fielding;

  for (const inn of scorecard.innings) {
    // --- Batting ---
    for (const b of inn.batting) {
      const acc = get(b.id, b.name);
      const didBat = b.balls > 0 || b.runs > 0 || b.out;
      if (!didBat) continue; // did-not-bat row

      if (b.runs) acc.items.push({ label: `${b.runs} run${b.runs === 1 ? "" : "s"}`, points: b.runs * B.run });
      if (b.fours) acc.items.push({ label: `${b.fours}×4 boundary bonus`, points: b.fours * B.boundaryBonus });
      if (b.sixes) acc.items.push({ label: `${b.sixes}×6 six bonus`, points: b.sixes * B.sixBonus });

      const ms = highestMilestoneBonus(B.milestones, (t) => b.runs >= t.runs);
      if (ms) acc.items.push({ label: `${ms.runs}+ runs milestone`, points: ms.bonus });

      // Duck: dismissed for 0 — bowlers are exempt.
      if (b.out && b.runs === 0 && !isBowlerRole(b.id)) {
        acc.items.push({ label: "Duck", points: B.duck });
      }

      // Strike rate: non-bowlers, min balls faced.
      if (b.balls >= FANTASY_T20.strikeRate.minBalls && !isBowlerRole(b.id)) {
        const sr = strikeRatePoints(b.strikeRate);
        if (sr !== 0) acc.items.push({ label: `Strike rate ${b.strikeRate}`, points: sr });
      }
    }

    // --- Bowling ---
    for (const w of inn.bowling) {
      const acc = get(w.id, w.name);
      if (w.dots) acc.items.push({ label: `${w.dots} dot ball${w.dots === 1 ? "" : "s"}`, points: w.dots * W.dotBall });
      if (w.wickets) acc.items.push({ label: `${w.wickets} wicket${w.wickets === 1 ? "" : "s"}`, points: w.wickets * W.wicket });
      if (w.maidens) acc.items.push({ label: `${w.maidens} maiden${w.maidens === 1 ? "" : "s"}`, points: w.maidens * W.maidenOver });

      const haul = highestMilestoneBonus(W.haul, (t) => w.wickets >= t.wickets);
      if (haul) acc.items.push({ label: `${haul.wickets}-wicket haul`, points: haul.bonus });

      if (w.overs >= FANTASY_T20.economy.minOvers) {
        const eco = economyPoints(w.economy);
        if (eco !== 0) acc.items.push({ label: `Economy ${w.economy}`, points: eco });
      }
    }

    // --- Fielding & bowled/LBW bonuses (derived from batting dismissals) ---
    for (const b of inn.batting) {
      if (!b.out) continue;
      const code = b.wicketCode;

      if (code === "CAUGHT") {
        const fid = b.fielderIds[0];
        if (fid) {
          const acc = get(fid, "");
          acc.items.push({ label: "Catch", points: F.catch });
          acc.catchCount += 1;
        }
      } else if (code === "STUMPED") {
        const fid = b.fielderIds[0];
        if (fid) get(fid, "").items.push({ label: "Stumping", points: F.stumping });
      } else if (code === "RUNOUT") {
        const fielders = b.fielderIds;
        const assumedDirect = fielders.length <= 1;
        if (assumedDirect && fielders[0]) {
          const acc = get(fielders[0], "");
          acc.items.push({ label: "Run out (direct)", points: F.runOutDirect });
          acc.runOuts.push({ fielderIds: fielders, assumedDirect, outBatterId: b.id });
        } else {
          for (const fid of fielders) {
            const acc = get(fid, "");
            acc.items.push({ label: "Run out (assist)", points: F.runOutAssist });
            acc.runOuts.push({ fielderIds: fielders, assumedDirect, outBatterId: b.id });
          }
        }
      }

      // LBW / Bowled bonus goes to the bowler.
      if ((code === "LBW" || code === "BOWLED") && b.bowlerId) {
        get(b.bowlerId, "").items.push({ label: "LBW/Bowled bonus", points: W.lbwBowledBonus });
      }
    }
  }

  // Catch bonus (awarded once at the threshold) + finalise totals.
  const out = new Map<string, FantasyPlayerScore>();
  for (const acc of accs.values()) {
    if (acc.catchCount >= 3) {
      acc.items.push({ label: `${acc.catchCount} catches bonus`, points: F.threeCatchBonus });
    }
    const total = acc.items.reduce((s, it) => s + it.points, 0);
    out.set(acc.id, {
      id: acc.id,
      name: acc.name,
      total,
      items: acc.items,
      runOuts: acc.runOuts,
    });
  }
  return out;
}
