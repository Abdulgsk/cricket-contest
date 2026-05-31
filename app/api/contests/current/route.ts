import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { FantasyTeam } from "@/models/FantasyTeam";
import {
  resolveCurrentContestMatch,
  listFantasyHolders,
  getFantasyTeamForView,
  refreshFantasyContestIfLive,
  getMy11LiveRefreshMs,
} from "@/services/contest";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireUser();
    const match = await resolveCurrentContestMatch();
    if (!match) {
      return NextResponse.json({
        ok: true,
        available: false,
        reason: "no_match",
      });
    }
    const refreshMs = await getMy11LiveRefreshMs();
    const status = match.status as "upcoming" | "live" | "completed";
    const matchId = String(match._id);

    // Refresh in-app fantasy points while the match is live (throttled), then
    // read the freshly-persisted totals for holders + my team.
    await refreshFantasyContestIfLive(matchId, status);

    const holders = await listFantasyHolders(matchId);

    // The viewer's own in-app fantasy team is always visible.
    const myTeam = await getFantasyTeamForView(matchId, String(me._id));

    // Summary used for the "build your team" CTA when none exists yet.
    const fantasy = await FantasyTeam.findOne({ matchId, userId: me._id })
      .select("players subs captainName viceCaptainName totalPoints pointsComputedAt")
      .lean();
    const myFantasy = fantasy
      ? {
          hasTeam: true,
          captainName: fantasy.captainName,
          viceCaptainName: fantasy.viceCaptainName,
          totalPoints: Math.round((fantasy.totalPoints ?? 0) * 100) / 100,
          playerCount: fantasy.players?.length ?? 0,
          subCount: fantasy.subs?.length ?? 0,
          scored: !!fantasy.pointsComputedAt,
        }
      : { hasTeam: false };

    return NextResponse.json({
      ok: true,
      available: true,
      refreshMs,
      match: {
        id: matchId,
        teamA: match.teamA,
        teamB: match.teamB,
        teamAShort: match.teamAShort ?? null,
        teamBShort: match.teamBShort ?? null,
        startTime: match.startTime,
        status,
        venue: match.venue ?? null,
        scoreSummary: match.scoreSummary ?? null,
        matchWinner: match.matchWinner ?? null,
        contestLinked: true,
      },
      myUserId: String(me._id),
      myTeam,
      myTeamReason: myTeam ? null : "team_not_mapped",
      myFantasy,
      holders,
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
