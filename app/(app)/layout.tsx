import { requireUser } from "@/lib/rbac";
import { Nav } from "@/components/nav";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { getSettings } from "@/models/Settings";
import { BONUSES } from "@/lib/constants";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  await connectDB();
  const [settings, bountyMatch] = await Promise.all([
    getSettings(),
    Match.findOne({
      bountyUserId: { $exists: true, $ne: null },
      status: { $in: ["upcoming", "live"] },
    })
      .sort({ startTime: 1 })
      .populate("bountyUserId", "username")
      .lean(),
  ]);
  return (
    <div className="flex flex-1 min-h-screen">
      <Nav role={me.role} />
      <div className="flex-1 flex flex-col min-w-0">
        {settings.announcement ? (
          <div className="m-3 md:m-4 ml-14 md:ml-3 glass rounded-xl px-4 py-2 text-sm text-primary">
            📣 {settings.announcement}
          </div>
        ) : null}
        {bountyMatch ? (
          <div className="mx-3 md:mx-4 glass rounded-xl px-4 py-2 text-sm text-warning">
            🎯 Bounty Match: {bountyMatch.teamA} vs {bountyMatch.teamB} · Target: {(bountyMatch.bountyUserId as unknown as { username?: string })?.username ?? "Selected player"} · Reward +{BONUSES.BOUNTY}
            {(bountyMatch.bountyReason as string | undefined)?.trim() ? (
              <span className="block mt-2 text-xs text-muted-foreground">
                Reason: {String(bountyMatch.bountyReason)}
              </span>
            ) : null}
          </div>
        ) : null}
        <main className="flex-1 p-3 sm:p-4 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
