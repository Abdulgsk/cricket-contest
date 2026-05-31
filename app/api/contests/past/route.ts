import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { FantasyTeam } from "@/models/FantasyTeam";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireUser();
    await connectDB();

    // Completed matches that have at least one in-app fantasy team.
    const playedMatchIds = await FantasyTeam.distinct("matchId");
    const matches = await Match.find({
      status: "completed",
      _id: { $in: playedMatchIds },
    })
      .sort({ startTime: -1 })
      .limit(40)
      .select("teamA teamB teamAShort teamBShort startTime status venue scoreSummary matchWinner")
      .lean();

    const ids = matches.map((m) => m._id);

    // My own score per match.
    const myTeams = await FantasyTeam.find({
      matchId: { $in: ids },
      userId: me._id,
    })
      .select("matchId totalPoints")
      .lean();
    const myScoreMap = new Map(
      myTeams.map((t) => [String(t.matchId), t.totalPoints ?? 0])
    );

    // Dense rank within each match (so myRank reflects the friend group).
    const allTeams = await FantasyTeam.find({ matchId: { $in: ids } })
      .select("matchId userId totalPoints")
      .lean();
    const byMatch = new Map<string, { userId: string; tp: number }[]>();
    for (const t of allTeams) {
      const key = String(t.matchId);
      if (!byMatch.has(key)) byMatch.set(key, []);
      byMatch.get(key)!.push({ userId: String(t.userId), tp: t.totalPoints ?? 0 });
    }
    const myRankMap = new Map<string, number>();
    for (const [key, rows] of byMatch) {
      rows.sort((a, b) => b.tp - a.tp);
      let lastTp: number | null = null;
      let lastRank = 0;
      rows.forEach((r, i) => {
        const rk = lastTp !== null && r.tp === lastTp ? lastRank : i + 1;
        if (r.userId === String(me._id)) myRankMap.set(key, rk);
        lastTp = r.tp;
        lastRank = rk;
      });
    }

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
          myRank: myRankMap.get(String(m._id)) ?? null,
          myScore: myScoreMap.has(String(m._id))
            ? Math.round((myScoreMap.get(String(m._id)) ?? 0) * 100) / 100
            : null,
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