import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { Prediction } from "@/models/Prediction";
import { requireUser } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default async function PredictionsPage() {
  const me = await requireUser();
  await connectDB();
  const upcoming = await Match.find({ status: "upcoming", startTime: { $gte: new Date() } })
    .sort({ startTime: 1 })
    .lean();
  const myPredictions = await Prediction.find({ userId: me._id }).lean();
  const submitted = new Set(myPredictions.map((p) => String(p.matchId)));
  const past = await Prediction.find({ userId: me._id, scored: true })
    .populate("matchId", "teamA teamB startTime")
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">Predictions</h1>
        <p className="text-muted-foreground text-sm">
          Lock in your guesses before each match. They stay hidden until the match starts.
        </p>
      </header>

      <Card>
        <h2 className="font-semibold mb-3">Open for prediction</h2>
        {!upcoming.length && <p className="text-sm text-muted-foreground">No upcoming matches.</p>}
        <div className="space-y-2">
          {upcoming.map((m) => (
            <Link
              key={String(m._id)}
              href={`/matches/${String(m._id)}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-3 sm:px-4 hover:bg-muted transition"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">
                  {m.teamA} vs {m.teamB}
                </div>
                <div className="text-xs text-muted-foreground truncate">{formatDate(m.startTime)}</div>
              </div>
              {submitted.has(String(m._id)) ? (
                <Badge tone="success" className="shrink-0 whitespace-nowrap">✏️ Edit</Badge>
              ) : (
                <Badge tone="accent" className="shrink-0 whitespace-nowrap">🎯 Predict</Badge>
              )}
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Recent results</h2>
        {!past.length && <p className="text-sm text-muted-foreground">No scored predictions yet.</p>}
        <div className="space-y-2">
          {past.map((p) => {
            const m = p.matchId as unknown as { teamA: string; teamB: string; startTime: Date };
            return (
              <div key={String(p._id)} className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-2 text-sm">
                <span>
                  {m.teamA} vs {m.teamB}
                </span>
                <span className={p.pointsAwarded > 0 ? "text-success font-semibold" : "text-muted-foreground"}>
                  {p.pointsAwarded > 0 ? `+${p.pointsAwarded}` : "0"} pts
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
