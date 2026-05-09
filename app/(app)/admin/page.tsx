import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { Card, Badge } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/rbac";
import { autoUpdateMatchStatuses } from "@/services/match-status";

export default async function AdminHome() {
  const me = await requireRole("admin", "superadmin");
  const isSuper = me.role === "superadmin";
  await connectDB();
  
  // Auto-update match statuses on page load
  await autoUpdateMatchStatuses();
  const [total, users, pending, upcoming, live, completed, next3] = await Promise.all([
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
  ]);

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

      <Card>
        <h2 className="font-semibold mb-2">⏱ Automatic schedule</h2>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>
            <code>00:30 UTC daily</code> · pulls fresh fixtures from Sportskeeda
          </li>
          <li>
            <code>every 10 min</code> · polls Cricbuzz for live scores & marks completed matches
          </li>
          <li>
            <code>every 15 min</code> · in-app reminders 75 min before each match
          </li>
        </ul>
        <p className="text-[11px] text-muted-foreground mt-2">
          Crons are wired in <code>vercel.json</code> and run automatically once deployed.
        </p>
      </Card>
    </div>
  );
}
