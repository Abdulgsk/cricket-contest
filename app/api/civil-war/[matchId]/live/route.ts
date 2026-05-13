import { requireUser } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { CivilWar } from "@/models/CivilWar";
import { User } from "@/models/User";
import {
  fetchLeaderboardFromContestUrl,
  My11AuthError,
  My11NotReadyError,
  type My11LeaderboardResult,
} from "@/lib/my11-api";
import { normalizeMy11circleName } from "@/lib/my11circle";

export const dynamic = "force-dynamic";

// Tiny per-process cache so a roomful of clients polling once a minute
// doesn't hammer my11. Keyed by contestUrl.
type CacheEntry = { at: number; data: My11LeaderboardResult };
const CACHE_TTL_MS = 15_000;
const lbCache = new Map<string, CacheEntry>();

async function getLeaderboardCached(contestUrl: string) {
  const hit = lbCache.get(contestUrl);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return { data: hit.data, fetchedAt: hit.at };
  const data = await fetchLeaderboardFromContestUrl(contestUrl);
  lbCache.set(contestUrl, { at: now, data });
  return { data, fetchedAt: now };
}

type LiveMember = {
  userId: string;
  username: string;
  fantasyPoints: number;
  isCaptain: boolean;
  isMe: boolean;
  matched: boolean;
};

type LiveTeam = {
  name: string;
  totalFp: number;
  members: LiveMember[];
  captainFp: number;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const me = await requireUser();
    const { matchId } = await params;
    await connectDB();

    const match = await Match.findById(matchId)
      .select("teamA teamB startTime status contestUrl")
      .lean();
    if (!match) {
      return Response.json({ ok: false, error: "Match not found" }, { status: 404 });
    }

    const cw = await CivilWar.findOne({ matchId }).lean();
    if (!cw) {
      return Response.json(
        { ok: false, available: false, reason: "no_civil_war" },
        { status: 200 }
      );
    }

    const myId = String(me._id);
    const isMember = cw.members.some((m) => String(m.userId) === myId);
    if (!isMember) {
      return Response.json({ ok: false, error: "Not a participant" }, { status: 403 });
    }

    if (!match.contestUrl) {
      return Response.json({
        ok: true,
        available: false,
        reason: "no_contest",
        matchStatus: match.status,
      });
    }
    if (match.status === "upcoming") {
      return Response.json({
        ok: true,
        available: false,
        reason: "not_started",
        matchStatus: match.status,
      });
    }

    // Captains
    const captainAId = cw.result?.captainAUserId
      ? String(cw.result.captainAUserId)
      : null;
    const captainBId = cw.result?.captainBUserId
      ? String(cw.result.captainBUserId)
      : null;
    let capA = captainAId;
    let capB = captainBId;
    if (!capA || !capB) {
      const { pickCaptains } = await import("@/services/civil-war");
      const { computeLeaderboard } = await import("@/services/scoring");
      const prevLb = await computeLeaderboard({ excludeMatchId: matchId });
      const order = prevLb.map((r) => String(r.userId));
      const picked = await pickCaptains(
        cw.members.map((m) => ({ userId: m.userId, side: m.side })),
        order,
        matchId
      );
      capA = capA ?? picked.captainA;
      capB = capB ?? picked.captainB;
    }

    const memberIds = cw.members.map((m) => String(m.userId));
    const users = await User.find({ _id: { $in: memberIds } })
      .select("username my11circleName")
      .lean();
    const userMap = new Map(
      users.map((u) => [
        String(u._id),
        {
          username: u.username,
          my11circleName: u.my11circleName ?? "",
        },
      ])
    );

    let lbResult;
    try {
      lbResult = await getLeaderboardCached(match.contestUrl);
    } catch (e) {
      if (e instanceof My11AuthError) {
        return Response.json({
          ok: true,
          available: false,
          reason: "auth_expired",
          matchStatus: match.status,
        });
      }
      if (e instanceof My11NotReadyError) {
        return Response.json({
          ok: true,
          available: false,
          reason: "not_ready",
          matchStatus: match.status,
        });
      }
      const msg = e instanceof Error ? e.message : "";
      if (/Contest URL must contain/i.test(msg)) {
        return Response.json({
          ok: true,
          available: false,
          reason: "bad_contest_url",
          matchStatus: match.status,
        });
      }
      throw e;
    }

    const lbMap = new Map(
      lbResult.data.entries.map((row) => [
        normalizeMy11circleName(row.username),
        row,
      ])
    );

    const buildMember = (m: {
      userId: { toString(): string };
      side: "A" | "B";
    }): LiveMember => {
      const uid = String(m.userId);
      const u = userMap.get(uid);
      const username = u?.username ?? "—";
      const key = u?.my11circleName
        ? normalizeMy11circleName(u.my11circleName)
        : "";
      const hit = key ? lbMap.get(key) : undefined;
      const isCaptain = uid === (m.side === "A" ? capA : capB);
      return {
        userId: uid,
        username,
        fantasyPoints: hit?.totalScore ?? 0,
        isCaptain,
        isMe: uid === myId,
        matched: !!hit,
      };
    };

    const teamA: LiveTeam = (() => {
      const members = cw.members
        .filter((m) => m.side === "A")
        .map(buildMember)
        .sort((a, b) => b.fantasyPoints - a.fantasyPoints);
      return {
        name: cw.teamAName,
        totalFp: members.reduce((s, m) => s + m.fantasyPoints, 0),
        captainFp: members.find((m) => m.isCaptain)?.fantasyPoints ?? 0,
        members,
      };
    })();
    const teamB: LiveTeam = (() => {
      const members = cw.members
        .filter((m) => m.side === "B")
        .map(buildMember)
        .sort((a, b) => b.fantasyPoints - a.fantasyPoints);
      return {
        name: cw.teamBName,
        totalFp: members.reduce((s, m) => s + m.fantasyPoints, 0),
        captainFp: members.find((m) => m.isCaptain)?.fantasyPoints ?? 0,
        members,
      };
    })();

    const totalAB = teamA.totalFp + teamB.totalFp;
    let leader: "A" | "B" | "tie" = "tie";
    let leadFp = 0;
    if (teamA.totalFp > teamB.totalFp) {
      leader = "A";
      leadFp = teamA.totalFp - teamB.totalFp;
    } else if (teamB.totalFp > teamA.totalFp) {
      leader = "B";
      leadFp = teamB.totalFp - teamA.totalFp;
    }
    // Naive win probability: share of total + slight regression to 50% so a
    // small lead doesn't read as 95%.
    const aShare = totalAB > 0 ? teamA.totalFp / totalAB : 0.5;
    const winProbA = Math.round((0.5 + (aShare - 0.5) * 0.85) * 100);
    const winProbB = 100 - winProbA;

    return Response.json({
      ok: true,
      available: true,
      matchStatus: match.status,
      lastUpdated: new Date(lbResult.fetchedAt).toISOString(),
      contestId: lbResult.data.contestId,
      my11MatchId: lbResult.data.matchId,
      teamA,
      teamB,
      leader,
      leadFp,
      winProb: { A: winProbA, B: winProbB },
      mySide: cw.members.find((m) => String(m.userId) === myId)?.side ?? null,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
