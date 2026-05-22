import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { autoMapAllLiveMatches } from "@/services/contest-auto-map";

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
 */
export async function autoUpdateMatchStatuses() {
  await connectDB();
  const now = new Date();

  // Update upcoming → live
  const upcomingToLive = await Match.updateMany(
    {
      status: "upcoming",
      startTime: { $lte: now },
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

  // Map any unmapped live matches to my11. Cheap when nothing pending.
  // Swallow errors so a transient my11 outage never breaks page rendering.
  try {
    await autoMapAllLiveMatches();
  } catch {
    // ignore — next page tick will retry
  }

  return {
    upcomingToLive: upcomingToLive.modifiedCount,
    liveToCompleted: liveToCompleted.modifiedCount,
  };
}
