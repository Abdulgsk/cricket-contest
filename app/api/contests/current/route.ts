import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { FantasyTeam } from "@/models/FantasyTeam";
import {
  resolveCurrentContestMatch,
  getCachedLeaderboard,
  getRefreshedUserMatchTeam,
  listMatchTeamHolders,
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
    const contestUrl = match.contestUrl ?? "";

    // Holders with live scores merged from the contest leaderboard (matched
    // by my11 username). Without this, only the viewing user's score would
    // be fresh — everyone else would carry the last time their team detail
    // was pulled.
    const holders = await listMatchTeamHolders(
      matchId,
      contestUrl && status !== "upcoming"
        ? { contestUrl, ttlMs: refreshMs }
        : undefined,
    );

    // Try fetch the requesting user's team, with auto-refresh while live.
    const myTeamRes = await getRefreshedUserMatchTeam({
      matchId,
      userId: String(me._id),
      ttlMs: refreshMs,
      matchStatus: status,
      contestUrl,
    });

    // Leaderboard (only meaningful once match is live or completed).
    let lb: Awaited<ReturnType<typeof getCachedLeaderboard>> | null = null;
    if (contestUrl && status !== "upcoming") {
      lb = await getCachedLeaderboard(contestUrl, refreshMs);
    }

    // The user's in-app GullyXI Fantasy team for this match (independent of
    // my11). Used to surface their XI / a "create team" CTA instead of an
    // "admin hasn't fetched" wait message.
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
        contestLinked: !!contestUrl,
      },
      myUserId: String(me._id),
      myTeam: myTeamRes.ok
        ? {
            ...myTeamRes.team,
            _id: String(myTeamRes.team._id),
            matchId: String(myTeamRes.team.matchId),
            userId: String(myTeamRes.team.userId),
            fetchedAt: myTeamRes.fetchedAt,
            cached: myTeamRes.cached,
          }
        : null,
      myTeamReason: myTeamRes.ok ? null : myTeamRes.error,
      myFantasy,
      holders,
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
