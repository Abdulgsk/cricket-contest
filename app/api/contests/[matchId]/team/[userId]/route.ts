import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { requireUser } from "@/lib/rbac";
import {
  getFantasyTeamForView,
  refreshFantasyContestIfLive,
  getMy11LiveRefreshMs,
} from "@/services/contest";
import { getSettings } from "@/models/Settings";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string; userId: string }> }
) {
  try {
    const me = await requireUser();
    const { matchId, userId } = await params;
    await connectDB();
    const match = await Match.findById(matchId)
      .select("teamA teamB teamAShort teamBShort startTime status venue scoreSummary matchWinner")
      .lean();
    if (!match) {
      return NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 });
    }
    const status = match.status as "upcoming" | "live" | "completed";
    const refreshMs = await getMy11LiveRefreshMs();
    const settings = await getSettings();
    const playerDirectoryEnabled = settings.playerDirectoryEnabled !== false;

    const matchPayload = {
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
    };

    // Other members' teams stay hidden until the match is live (no peeking at
    // rivals' line-ups pre-toss). Your own team is always visible.
    const isOther = String(userId) !== String(me._id);
    if (isOther && status === "upcoming") {
      return NextResponse.json({
        ok: true,
        refreshMs,
        playerDirectoryEnabled,
        match: matchPayload,
        team: null,
        reason: "hidden_until_live",
        leaderboard: null,
        leaderboardError: null,
      });
    }

    // Refresh in-app fantasy points while live (throttled), then read totals.
    await refreshFantasyContestIfLive(String(match._id), status);
    const team = await getFantasyTeamForView(String(match._id), String(userId));

    return NextResponse.json({
      ok: true,
      refreshMs,
      playerDirectoryEnabled,
      match: matchPayload,
      team,
      reason: team ? null : "team_not_mapped",
      leaderboard: null,
      leaderboardError: null,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
