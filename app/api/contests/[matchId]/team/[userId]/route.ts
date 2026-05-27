import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { requireUser } from "@/lib/rbac";
import {
  getRefreshedUserMatchTeam,
  getCachedLeaderboard,
  getMy11LiveRefreshMs,
} from "@/services/contest";
import { getSettings } from "@/models/Settings";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string; userId: string }> }
) {
  try {
    await requireUser();
    const { matchId, userId } = await params;
    await connectDB();
    const match = await Match.findById(matchId)
      .select("teamA teamB teamAShort teamBShort startTime status venue contestUrl scoreSummary matchWinner")
      .lean();
    if (!match) {
      return NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 });
    }
    const status = match.status as "upcoming" | "live" | "completed";
    const refreshMs = await getMy11LiveRefreshMs();
    const settings = await getSettings();
    const playerDirectoryEnabled = settings.playerDirectoryEnabled !== false;
    const teamRes = await getRefreshedUserMatchTeam({
      matchId,
      userId,
      ttlMs: refreshMs,
      matchStatus: status,
      contestUrl: match.contestUrl ?? "",
    });

    let lb: Awaited<ReturnType<typeof getCachedLeaderboard>> | null = null;
    if (match.contestUrl && status !== "upcoming") {
      lb = await getCachedLeaderboard(match.contestUrl, refreshMs);
    }

    return NextResponse.json({
      ok: true,
      refreshMs,
      playerDirectoryEnabled,
      match: {
        id: String(match._id),
        teamA: match.teamA,
        teamB: match.teamB,
        teamAShort: match.teamAShort ?? null,
        teamBShort: match.teamBShort ?? null,
        startTime: match.startTime,
        status,
        venue: match.venue ?? null,
        scoreSummary: match.scoreSummary ?? null,
        matchWinner: match.matchWinner ?? null,
      },
      team: teamRes.ok
        ? {
            ...teamRes.team,
            _id: String(teamRes.team._id),
            matchId: String(teamRes.team.matchId),
            userId: String(teamRes.team.userId),
            fetchedAt: teamRes.fetchedAt,
            cached: teamRes.cached,
          }
        : null,
      reason: teamRes.ok ? null : teamRes.error,
      leaderboard: lb && "data" in lb && lb.data ? lb.data.entries : null,
      leaderboardError: lb && "error" in lb ? lb.error : null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
