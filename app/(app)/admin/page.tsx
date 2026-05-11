import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { Rivalry } from "@/models/Rivalry";
import { Card, Badge } from "@/components/ui/card";
import { AutomationTools } from "@/components/admin/automation-tools";
import { RegenerateFactsButton } from "@/components/admin/regenerate-facts-button";
import { RivalryWithdrawalQueue } from "@/components/admin/rivalry-withdrawal-queue";
import { AdminOverviewTabs } from "@/components/admin/admin-overview-tabs";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/rbac";
import { autoUpdateMatchStatuses } from "@/services/match-status";

export default async function AdminHome() {
  await requireRole("admin", "superadmin");
  await connectDB();

  await autoUpdateMatchStatuses();
  const [total, users, pending, upcoming, live, completed, next3, withdrawalRequests] = await Promise.all([
    Match.countDocuments(),
    User.countDocuments(),
    Match.countDocuments({ resultsEntered: false, status: { $ne: "upcoming" } }),
    Match.countDocuments({ status: "upcoming" }),
    Match.countDocuments({ status: "live" }),
    Match.countDocuments({ status: "completed" }),
    Match.find({ status: { $in: ["upcoming", "live"] } })
      .sort({ startTime: 1 })
      .limit(3)
      .lean(),
    Rivalry.find({
      withdrawalRequestedAt: { $ne: null },
      status: { $in: ["pending", "accepted"] },
    })
      .populate("matchId", "teamA teamB startTime")
      .populate("challengerId", "username")
      .populate("opponentId", "username")
      .populate("withdrawalRequestedBy", "username")
      .sort({ withdrawalRequestedAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const withdrawalRows = withdrawalRequests.map((r) => {
    const match = r.matchId as unknown as { teamA?: string; teamB?: string; startTime?: Date };
    const challenger = r.challengerId as unknown as { username?: string };
    const opponent = r.opponentId as unknown as { username?: string };
    const requester = r.withdrawalRequestedBy as unknown as { username?: string };
    return {
      rivalryId: String(r._id),
      matchLabel: match?.teamA && match?.teamB ? `${match.teamA} vs ${match.teamB}` : "Unknown match",
      challenger: challenger?.username ?? "—",
      opponent: opponent?.username ?? "—",
      requestedBy: requester?.username ?? "—",
      requestedAt: r.withdrawalRequestedAt ? String(r.withdrawalRequestedAt) : new Date().toISOString(),
      status: r.status,
    };
  });

  const dashboardTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">Matches</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1">{total}</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 leading-tight">
            {upcoming} up · {live} live · {completed} done
          </div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">Players</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1">{users}</div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">Pending results</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1 text-warning">{pending}</div>
          <Link href="/admin/matches" className="text-[10px] sm:text-xs text-pink-400 hover:underline mt-1 inline-block">
            Enter results →
          </Link>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">Withdrawals</div>
          <div className="text-2xl sm:text-3xl font-bold mt-1 text-warning">{withdrawalRows.length}</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">awaiting review</div>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold mb-3 text-sm sm:text-base">Next up</h2>
        {next3.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming matches.{" "}
            <Link href="/admin/matches" className="text-pink-400 underline">
              Sync IPL matches
            </Link>{" "}
            to populate.
          </p>
        ) : (
          <div className="space-y-2">
            {next3.map((m) => (
              <Link
                key={String(m._id)}
                href={`/admin/matches/${String(m._id)}/result`}
                className="flex items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.teamA} vs {m.teamB}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{formatDate(m.startTime)}</div>
                </div>
                <Badge tone={m.status === "live" ? "danger" : "accent"}>{m.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  const requestsTab = <RivalryWithdrawalQueue rows={withdrawalRows} />;

  const toolsTab = (
    <div className="space-y-4">
      <AutomationTools />
      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-sm sm:text-base">📰 Dashboard storylines</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Regenerate &ldquo;Today&apos;s storylines&rdquo; from the most recently scored match.
            </p>
          </div>
          <RegenerateFactsButton />
        </div>
      </Card>
    </div>
  );

  const helpTab = (
    <Card>
      <h2 className="font-semibold mb-3 text-sm sm:text-base">How automations work</h2>
      <div className="space-y-3 text-sm text-muted-foreground">
        <div>
          <div className="font-medium text-foreground">Refresh match statuses</div>
          <p>Moves matches from upcoming → live when start time passes. Live → completed only after results are entered.</p>
        </div>
        <div>
          <div className="font-medium text-foreground">Sync fixtures now</div>
          <p>Pulls latest IPL fixtures from Sportskeeda, adds missing matches, and updates upcoming fixtures safely.</p>
        </div>
        <div>
          <div className="font-medium text-foreground">Force complete</div>
          <p>Manually marks a match completed and locks predictions. Use when you confirm the match has ended.</p>
        </div>
        <div>
          <div className="font-medium text-foreground">Automatic on page load</div>
          <p>Admin and match pages refresh status automatically so dashboard values stay current.</p>
        </div>
      </div>
    </Card>
  );

  return (
    <AdminOverviewTabs
      tabs={[
        { id: "dashboard", label: "Dashboard", icon: "📊", content: dashboardTab },
        { id: "requests", label: "Requests", icon: "⚔️", badge: withdrawalRows.length, content: requestsTab },
        { id: "tools", label: "Tools", icon: "🛠", content: toolsTab },
        { id: "help", label: "Help", icon: "❓", content: helpTab },
      ]}
    />
  );
}
