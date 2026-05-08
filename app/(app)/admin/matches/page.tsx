import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { Card, Badge } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { CreateMatchForm } from "@/components/admin/create-match-form";
import { SyncIplPanel } from "@/components/admin/sync-ipl-panel";
import { SyncPlayoffsPanel } from "@/components/admin/sync-playoffs-panel";
import { requireUser } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

export default async function AdminMatches() {
  const me = await requireUser();
  await connectDB();
  const matches = await Match.find().sort({ startTime: -1 }).lean();
  return (
    <div className="space-y-4">
      <SyncIplPanel />
      {me.role === "superadmin" && <SyncPlayoffsPanel />}
      <CreateMatchForm />
      <Card>
        <h2 className="font-semibold mb-3">All matches</h2>
        <div className="space-y-2">
          {matches.map((m) => (
            <div key={String(m._id)} className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3">
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <TeamLogo name={m.teamA} size={22} />
                  {m.teamA}
                  <span className="text-muted-foreground text-xs">vs</span>
                  <TeamLogo name={m.teamB} size={22} />
                  {m.teamB}
                  {m.stage && m.stage !== "League" && <Badge tone="warning">{m.stage}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(m.startTime)}</div>
                {m.scoreSummary && (
                  <div className="text-xs text-muted-foreground mt-0.5">{m.scoreSummary}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.status === "live" ? "danger" : m.status === "completed" ? "success" : "accent"}>
                  {m.status}
                </Badge>
                <Link
                  href={`/admin/matches/${String(m._id)}/result`}
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold"
                >
                  {m.resultsEntered ? "Edit results" : "Enter results"}
                </Link>
              </div>
            </div>
          ))}
          {!matches.length && <p className="text-sm text-muted-foreground">No matches yet.</p>}
        </div>
      </Card>
    </div>
  );
}
