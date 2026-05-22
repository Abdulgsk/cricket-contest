import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { UserMatchTeam } from "@/models/UserMatchTeam";
import { normalizeMy11circleName } from "@/lib/my11circle";
import {
  getLeaderboard,
  getUserTeamDetails,
  My11AuthError,
  My11NotReadyError,
} from "@/lib/my11-api";
import { getSession } from "@/lib/session";
import { apiAssertFeature } from "@/lib/rbac";

function parseIdsFromContestUrl(url: string): { matchId: number; contestId: number } | null {
  const m = url.match(/leaderboard\/(\d+)\/(\d+)/);
  if (!m) return null;
  return { matchId: Number(m[1]), contestId: Number(m[2]) };
}

interface RequestBody {
  matchId: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const gate = await apiAssertFeature(session, "results.manage");
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
    }

    const body = (await req.json()) as RequestBody;
    const { matchId } = body;
    if (!matchId) {
      return NextResponse.json({ ok: false, error: "matchId required" }, { status: 400 });
    }

    await connectDB();

    const match = await Match.findById(matchId).select("contestUrl").lean();
    if (!match?.contestUrl) {
      return NextResponse.json(
        { ok: false, error: "Add the contest link first" },
        { status: 400 }
      );
    }
    const ids = parseIdsFromContestUrl(match.contestUrl);
    if (!ids) {
      return NextResponse.json(
        {
          ok: false,
          error: "Contest URL must contain /leaderboard/<matchId>/<contestId>",
        },
        { status: 400 }
      );
    }

    // 1. Pull leaderboard so we can map my11 username -> teamId
    const leaderboard = await getLeaderboard(ids.matchId, ids.contestId);
    const teamIdByName = new Map<string, { teamId: number; username: string }>();
    for (const row of leaderboard.entries) {
      if (row.teamId == null) continue;
      teamIdByName.set(normalizeMy11circleName(row.username), {
        teamId: row.teamId,
        username: row.username,
      });
    }

    // 2. Load all app users with a my11 mapping
    const users = await User.find({
      my11circleName: { $exists: true, $ne: "" },
    })
      .select("username userId my11circleName")
      .lean();

    const results: Array<{
      userId: string;
      username: string;
      my11circleName: string;
      teamId?: number;
      score?: number | null;
      rank?: number | null;
      players?: number;
      ok: boolean;
      error?: string;
    }> = [];

    for (const u of users) {
      const key = normalizeMy11circleName(u.my11circleName ?? "");
      const hit = teamIdByName.get(key);
      if (!hit) {
        results.push({
          userId: String(u._id),
          username: u.username,
          my11circleName: u.my11circleName ?? "",
          ok: false,
          error: "Not in contest leaderboard",
        });
        continue;
      }
      try {
        const detail = await getUserTeamDetails({
          matchId: ids.matchId,
          contestId: ids.contestId,
          teamId: hit.teamId,
        });
        await UserMatchTeam.updateOne(
          { matchId, userId: u._id },
          {
            $set: {
              matchId,
              userId: u._id,
              my11MatchId: ids.matchId,
              my11ContestId: ids.contestId,
              my11UserTeamId: detail.userTeamId,
              my11Username: detail.uName || hit.username,
              userTeamName: detail.userTeamName,
              rank: detail.rank,
              score: detail.score,
              captainName: detail.captainName,
              viceCaptainName: detail.viceCaptainName,
              captainIds: detail.captainIds,
              viceCaptainIds: detail.viceCaptainIds,
              players: detail.players,
              fetchedAt: new Date(),
              sourceUpdatedAt: detail.updatedAt ? new Date(detail.updatedAt) : null,
            },
          },
          { upsert: true }
        );
        results.push({
          userId: String(u._id),
          username: u.username,
          my11circleName: u.my11circleName ?? "",
          teamId: hit.teamId,
          score: detail.score,
          rank: detail.rank,
          players: detail.players.length,
          ok: true,
        });
      } catch (err) {
        results.push({
          userId: String(u._id),
          username: u.username,
          my11circleName: u.my11circleName ?? "",
          teamId: hit.teamId,
          ok: false,
          error: err instanceof Error ? err.message : "fetch failed",
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: true,
      contestId: ids.contestId,
      sourceMatchId: ids.matchId,
      totalUsers: users.length,
      fetched: okCount,
      skipped: results.length - okCount,
      results,
    });
  } catch (error) {
    if (error instanceof My11AuthError) {
      return NextResponse.json(
        {
          ok: false,
          needsLogin: true,
          error: "My11 session expired. Re-sync the cookie via the browser extension.",
        },
        { status: 401 }
      );
    }
    if (error instanceof My11NotReadyError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 425 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
