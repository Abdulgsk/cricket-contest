import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { autoMapAllLiveMatches } from "@/services/contest-auto-map";
import { recomputeFantasyForLiveMatches } from "@/services/fantasy-recompute";

/**
 * Auto-update match statuses:
 * - upcoming → live if startTime has passed and status is still "upcoming"
 * - live → completed if resultsEntered is true and status is still "live"
 *
 * Also opportunistically runs the contest auto-mapper for any live match
 * whose my11 contest hasn't been mapped yet. This piggybacks on the same
 * lazy "tick" that every protected page already runs, so we don't need a
 * separate cron. `autoMapAllLiveMatches` is a no-op when there's nothing
 * pending (it filters `status: "live", autoMapDone: { $ne: true }`).
 *
 * Throttled per warm lambda instance so a burst of page loads doesn't
 * hammer Mongo (and my11) — the work is idempotent so missing a beat is fine.
 */
const STATUS_TTL_MS = 60_000;
const MAP_TTL_MS = 5 * 60_000;
const FANTASY_TTL_MS = 90_000;
type Tick = { statusAt: number; mapAt: number; fantasyAt: number };
const g = global as unknown as { _matchStatusTick?: Tick };
const tick: Tick = g._matchStatusTick ?? { statusAt: 0, mapAt: 0, fantasyAt: 0 };
g._matchStatusTick = tick;

export async function autoUpdateMatchStatuses() {
  const now = Date.now();
  if (now - tick.statusAt < STATUS_TTL_MS) {
    return { upcomingToLive: 0, liveToCompleted: 0, throttled: true as const };
  }
  tick.statusAt = now;

  await connectDB();
  const nowDate = new Date();

  // Update upcoming → live
  const upcomingToLive = await Match.updateMany(
    {
      status: "upcoming",
      startTime: { $lte: nowDate },
    },
    { status: "live" }
  );

  // Update live → completed if results are entered
  const liveToCompleted = await Match.updateMany(
    {
      status: "live",
      resultsEntered: true,
    },
    { status: "completed" }
  );

  // Map any unmapped live matches to my11 — independently throttled because
  // it issues network calls. Swallow errors so a transient my11 outage never
  // breaks page rendering.
  if (now - tick.mapAt >= MAP_TTL_MS) {
    tick.mapAt = now;
    try {
      await autoMapAllLiveMatches();
    } catch {
      // ignore — next tick will retry
    }
  }

  // Recompute in-app fantasy points for live matches off the Cricbuzz
  // scorecard. Independently throttled (network calls); idempotent so a
  // missed beat is harmless.
  if (now - tick.fantasyAt >= FANTASY_TTL_MS) {
    tick.fantasyAt = now;
    try {
      await recomputeFantasyForLiveMatches();
    } catch {
      // ignore — next tick will retry
    }
  }

  return {
    upcomingToLive: upcomingToLive.modifiedCount,
    liveToCompleted: liveToCompleted.modifiedCount,
  };
}
