import { CompareView } from "@/components/contest/compare-view";
import { requireUser } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { Match } from "@/models/Match";
import { computeLeaderboard } from "@/services/scoring";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  params,
}: {
  params: Promise<{ matchId: string; userId: string }>;
}) {
  const { matchId, userId } = await params;
  const me = await requireUser();
  await connectDB();

  const match = await Match.findById(matchId).select("teamA teamB startTime status").lean();
  if (!match) notFound();

  const otherUser = await User.findById(userId)
    .select("username userId avatar avatarColor")
    .lean();
  if (!otherUser) notFound();

  // Season leaderboard rank for both
  const seasonLb = await computeLeaderboard();
  const meRow = seasonLb.find((r) => String(r.userId) === String(me._id));
  const otherRow = seasonLb.find((r) => String(r.userId) === String(otherUser._id));

  return (
    <CompareView
      matchId={matchId}
      meId={String(me._id)}
      meUsername={me.username}
      meAvatar={me.avatar ?? null}
      otherId={String(otherUser._id)}
      otherUsername={otherUser.username}
      otherAvatar={otherUser.avatar ?? null}
      seasonRanks={{
        me: meRow ? { rank: meRow.position, total: meRow.totalPoints } : null,
        other: otherRow ? { rank: otherRow.position, total: otherRow.totalPoints } : null,
        seasonSize: seasonLb.length,
      }}
    />
  );
}
