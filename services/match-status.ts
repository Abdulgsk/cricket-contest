import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";

/**
 * Auto-update match statuses:
 * - upcoming → live if startTime has passed and status is still "upcoming"
 * - live → completed if resultsEntered is true and status is still "live"
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

  return {
    upcomingToLive: upcomingToLive.modifiedCount,
    liveToCompleted: liveToCompleted.modifiedCount,
  };
}
