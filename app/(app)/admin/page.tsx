import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { Rivalry } from "@/models/Rivalry";
import { Card, Badge } from "@/components/ui/card";
import { AutomationTools } from "@/components/admin/automation-tools";
import { RegenerateFactsButton } from "@/components/admin/regenerate-facts-button";
import { RivalryWithdrawalQueue } from "@/components/admin/rivalry-withdrawal-queue";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/rbac";
import { autoUpdateMatchStatuses } from "@/services/match-status";

export default async function AdminHome() {
  await requireRole("admin", "superadmin");
  await connectDB();
  
  // Auto-update match statuses on page load
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Total matches</div>
          <div className="text-3xl sm:text-4xl font-bold mt-2">{total}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {upcoming} upcoming · {live} live · {completed} done
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Players</div>
          <div className="text-3xl sm:text-4xl font-bold mt-2">{users}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Pending results</div>
          <div className="text-3xl sm:text-4xl font-bold mt-2 text-warning">{pending}</div>
          <Link href="/admin/matches" className="text-xs text-pink-400 hover:underline mt-1">
            Enter results →
          </Link>
        </Card>
        <Card>
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Quick actions</div>
          <div className="mt-2 flex flex-col gap-1.5 text-xs">
            <Link href="/admin/matches" className="text-pink-400 hover:underline">
              ⚡ Sync IPL
            </Link>
            <a
              href="/api/admin/scrape-debug"
              target="_blank"
              rel="noreferrer"
              className="text-pink-400 hover:underline"
            >
              🔍 Test scrapers
            </a>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold mb-3">Next up</h2>
        {next3.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming matches in DB. Go to{" "}
            <Link href="/admin/matches" className="text-pink-400 underline">
              Matches
            </Link>{" "}
            and click <strong>Sync IPL matches now</strong>.
          </p>
        ) : (
          <div className="space-y-2">
            {next3.map((m) => (
              <Link
                key={String(m._id)}
                href={`/admin/matches/${String(m._id)}/result`}
                className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2 hover:bg-muted/50"
              >
                <div>
                  <div className="text-sm font-medium">
                    {m.teamA} vs {m.teamB}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDate(m.startTime)}</div>
                </div>
                <Badge tone={m.status === "live" ? "danger" : "accent"}>{m.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <AutomationTools />

      <RivalryWithdrawalQueue rows={withdrawalRows} />

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">📰 Dashboard storylines</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Regenerate the &ldquo;Today&apos;s storylines&rdquo; card from the most recently
              scored match.
            </p>
          </div>
          <RegenerateFactsButton />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">How Automations Work</h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">Refresh Match Statuses</div>
            <p>
              Moves matches from upcoming to live when start time passes. Moves live to completed
              only after results are entered.
            </p>
          </div>

          <div>
            <div className="font-medium text-foreground">Sync Fixtures Now</div>
            <p>
              Pulls latest IPL fixtures from Sportskeeda, adds missing matches, and updates existing
              upcoming fixtures safely.
            </p>
          </div>

          <div>
            <div className="font-medium text-foreground">Force Complete</div>
            <p>
              Manually sets a selected match to completed and locks predictions immediately. This is
              useful when you confirm the match has ended and want reveal to happen at match end.
            </p>
          </div>

          <div>
            <div className="font-medium text-foreground">Automatic On Page Load</div>
            <p>
              Admin and match pages automatically run a status refresh so dashboard values stay
              current when pages are opened.
            </p>
          </div>
        </div>
      </Card>

    </div>
  );
}
