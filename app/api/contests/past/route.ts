import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { UserMatchTeam } from "@/models/UserMatchTeam";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireUser();
    await connectDB();
    const matches = await Match.find({
      status: "completed",
      contestUrl: { $exists: true, $ne: "" },
    })
      .sort({ startTime: -1 })
      .limit(40)
      .select("teamA teamB teamAShort teamBShort startTime status venue scoreSummary matchWinner")
      .lean();

    const ids = matches.map((m) => m._id);
    const myTeams = await UserMatchTeam.find({
      matchId: { $in: ids },
      userId: me._id,
    })
      .select("matchId rank score")
      .lean();
    const myMap = new Map(
      myTeams.map((t) => [String(t.matchId), { rank: t.rank, score: t.score }])
    );

    return NextResponse.json(
      {
        ok: true,
        matches: matches.map((m) => ({
          id: String(m._id),
          teamA: m.teamA,
          teamB: m.teamB,
          teamAShort: m.teamAShort ?? null,
          teamBShort: m.teamBShort ?? null,
          startTime: m.startTime,
          venue: m.venue ?? null,
          scoreSummary: m.scoreSummary ?? null,
          matchWinner: m.matchWinner ?? null,
          myRank: myMap.get(String(m._id))?.rank ?? null,
          myScore: myMap.get(String(m._id))?.score ?? null,
        })),
      },
      {
        // Per-user data (myRank/myScore) — private only. Completed matches
        // change rarely; SWR keeps the UI snappy while still revalidating.
        headers: {
          "Cache-Control":
            "private, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
