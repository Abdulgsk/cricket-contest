import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { CivilWar } from "@/models/CivilWar";
import { getSettings } from "@/models/Settings";

export const CIVIL_WAR_DEFAULTS = {
  decisiveWin: 2,
  decisiveLoss: 2,
  splitWin: 1,
  splitLoss: 1,
};

export const CIVIL_WAR_MIN_RIVALRIES = 2;

/**
 * Ensure both players of an accepted rivalry are in this match's CivilWar
 * doc on OPPOSITE sides. Random which one to which.
 * Idempotent — safe to call repeatedly.
 */
export async function attachRivalryToCivilWar(rivalry: {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  challengerId: mongoose.Types.ObjectId;
  opponentId: mongoose.Types.ObjectId;
}) {
  await connectDB();
  let cw = await CivilWar.findOne({ matchId: rivalry.matchId });
  if (!cw) {
    cw = await CivilWar.create({ matchId: rivalry.matchId, members: [] });
  }
  const challengerStr = String(rivalry.challengerId);
  const opponentStr = String(rivalry.opponentId);
  const memberMap = new Map(cw.members.map((m) => [String(m.userId), m]));
  const challengerExists = memberMap.has(challengerStr);
  const opponentExists = memberMap.has(opponentStr);

  let challengerSide: "A" | "B" | null = challengerExists
    ? memberMap.get(challengerStr)!.side
    : null;
  let opponentSide: "A" | "B" | null = opponentExists
    ? memberMap.get(opponentStr)!.side
    : null;

  if (!challengerSide && !opponentSide) {
    const flip = Math.random() < 0.5;
    challengerSide = flip ? "A" : "B";
    opponentSide = flip ? "B" : "A";
  } else if (!challengerSide && opponentSide) {
    challengerSide = opponentSide === "A" ? "B" : "A";
  } else if (challengerSide && !opponentSide) {
    opponentSide = challengerSide === "A" ? "B" : "A";
  }

  if (!challengerExists) {
    cw.members.push({
      userId: rivalry.challengerId,
      side: challengerSide!,
      rivalryId: rivalry._id,
    });
  }
  if (!opponentExists) {
    cw.members.push({
      userId: rivalry.opponentId,
      side: opponentSide!,
      rivalryId: rivalry._id,
    });
  }
  await cw.save();
}

/** Remove both players of a rivalry from CivilWar membership. */
export async function detachRivalryFromCivilWar(rivalry: {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
}) {
  await connectDB();
  const cw = await CivilWar.findOne({ matchId: rivalry.matchId });
  if (!cw) return;
  cw.members = cw.members.filter((m) => String(m.rivalryId) !== String(rivalry._id));
  await cw.save();
}

export async function getCivilWarConfig() {
  const settings = await getSettings();
  const cfg = settings.civilWarConfig ?? {};
  return {
    decisiveWin: cfg.decisiveWin ?? CIVIL_WAR_DEFAULTS.decisiveWin,
    decisiveLoss: cfg.decisiveLoss ?? CIVIL_WAR_DEFAULTS.decisiveLoss,
    splitWin: cfg.splitWin ?? CIVIL_WAR_DEFAULTS.splitWin,
    splitLoss: cfg.splitLoss ?? CIVIL_WAR_DEFAULTS.splitLoss,
  };
}

/**
 * Pick the captain of each side = the member with the highest pre-match
 * leaderboard position (lowest rank #). Tiebreak: most recent settled match's
 * fantasyPoints higher. Final fallback: alphabetical by username.
 */
export async function pickCaptains(
  members: Array<{ userId: mongoose.Types.ObjectId; side: "A" | "B" }>,
  prevLeaderboardOrder: string[], // userIds in leaderboard order (best first)
  excludeMatchId?: string
): Promise<{ captainA: string | null; captainB: string | null }> {
  const { MatchResult } = await import("@/models/MatchResult");
  const { User } = await import("@/models/User");
  const rankMap = new Map<string, number>();
  prevLeaderboardOrder.forEach((id, idx) => rankMap.set(id, idx + 1));

  async function pickSide(side: "A" | "B"): Promise<string | null> {
    const sideMembers = members
      .filter((m) => m.side === side)
      .map((m) => String(m.userId));
    if (sideMembers.length === 0) return null;
    const ranked = sideMembers
      .map((id) => ({ id, rank: rankMap.get(id) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.rank - b.rank);
    const bestRank = ranked[0].rank;
    const tied = ranked.filter((r) => r.rank === bestRank).map((r) => r.id);
    if (tied.length === 1) return tied[0];

    // Tiebreak: most recent settled match's FP higher.
    const recent = await MatchResult.find({
      userId: { $in: tied },
      ...(excludeMatchId
        ? { matchId: { $ne: new mongoose.Types.ObjectId(excludeMatchId) } }
        : {}),
    })
      .sort({ createdAt: -1 })
      .lean();
    const seen = new Set<string>();
    const lastFp = new Map<string, number>();
    for (const r of recent) {
      const uid = String(r.userId);
      if (seen.has(uid)) continue;
      seen.add(uid);
      lastFp.set(uid, r.fantasyPoints ?? 0);
    }
    const byFp = tied
      .map((id) => ({ id, fp: lastFp.get(id) ?? 0 }))
      .sort((a, b) => b.fp - a.fp);
    const topFp = byFp[0].fp;
    const stillTied = byFp.filter((x) => x.fp === topFp).map((x) => x.id);
    if (stillTied.length === 1) return stillTied[0];

    // Final fallback: alphabetical username.
    const users = await User.find({ _id: { $in: stillTied } })
      .select("username")
      .lean();
    const sorted = users
      .map((u) => ({ id: String(u._id), name: u.username }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return sorted[0]?.id ?? stillTied[0];
  }

  const [captainA, captainB] = await Promise.all([pickSide("A"), pickSide("B")]);
  return { captainA, captainB };
}

/**
 * Settle a civil war after match results + rivalries are settled.
 * Returns per-user point adjustments to be applied as `civilWarPoints`.
 */
export async function settleCivilWar(args: {
  matchId: string;
  matchResults: Array<{ userId: mongoose.Types.ObjectId; fantasyPoints: number; missed: boolean }>;
  rivalries: Array<{ _id: mongoose.Types.ObjectId; winnerId?: mongoose.Types.ObjectId | null; settled: boolean }>;
  prevLeaderboardOrder?: string[]; // userIds best→worst, pre-match
  captainTeamWin?: number;
  leaderTopperBonus?: number;
}): Promise<Map<string, number>> {
  await connectDB();
  const cw = await CivilWar.findOne({ matchId: args.matchId });
  const result = new Map<string, number>();
  if (!cw) return result;

  const cfg = await getCivilWarConfig();
  const captainTeamWin = args.captainTeamWin ?? 1;
  const leaderTopperBonus = args.leaderTopperBonus ?? 1;

  const distinctRivalryIds = new Set(cw.members.map((m) => String(m.rivalryId)));
  if (distinctRivalryIds.size < CIVIL_WAR_MIN_RIVALRIES) {
    cw.settled = true;
    cw.result = {
      teamAWinners: 0,
      teamBWinners: 0,
      teamAFp: 0,
      teamBFp: 0,
      outcome: "not_eligible",
      teamAPointsPerMember: 0,
      teamBPointsPerMember: 0,
      captainAUserId: null,
      captainBUserId: null,
      captainAFp: 0,
      captainBFp: 0,
      captainWinnerSide: null,
      captainBonusPerMember: 0,
      leaderTopperUserId: null,
      leaderTopperBonus: 0,
    };
    await cw.save();
    return result;
  }

  const rivalryMap = new Map(args.rivalries.map((r) => [String(r._id), r]));
  const fpMap = new Map(args.matchResults.map((m) => [String(m.userId), m.fantasyPoints]));

  let teamAWinners = 0;
  let teamBWinners = 0;
  let teamAFp = 0;
  let teamBFp = 0;

  for (const m of cw.members) {
    const fp = fpMap.get(String(m.userId)) ?? 0;
    if (m.side === "A") teamAFp += fp;
    else teamBFp += fp;
  }

  const countedRivalries = new Set<string>();
  for (const m of cw.members) {
    const rivId = String(m.rivalryId);
    if (countedRivalries.has(rivId)) continue;
    const riv = rivalryMap.get(rivId);
    if (!riv || !riv.settled || !riv.winnerId) continue;
    const winnerStr = String(riv.winnerId);
    const winnerMember = cw.members.find((mem) => String(mem.userId) === winnerStr);
    if (!winnerMember) continue;
    if (winnerMember.side === "A") teamAWinners += 1;
    else teamBWinners += 1;
    countedRivalries.add(rivId);
  }

  let outcome:
    | "A_decisive"
    | "B_decisive"
    | "A_split"
    | "B_split"
    | "A_fp_tiebreak"
    | "B_fp_tiebreak"
    | "draw";
  let teamAPts = 0;
  let teamBPts = 0;
  if (teamAWinners > teamBWinners && teamAFp > teamBFp) {
    outcome = "A_decisive";
    teamAPts = cfg.decisiveWin;
    teamBPts = -cfg.decisiveLoss;
  } else if (teamBWinners > teamAWinners && teamBFp > teamAFp) {
    outcome = "B_decisive";
    teamAPts = -cfg.decisiveLoss;
    teamBPts = cfg.decisiveWin;
  } else if (teamAWinners > teamBWinners) {
    outcome = "A_split";
    teamAPts = cfg.splitWin;
    teamBPts = -cfg.splitLoss;
  } else if (teamBWinners > teamAWinners) {
    outcome = "B_split";
    teamAPts = -cfg.splitLoss;
    teamBPts = cfg.splitWin;
  } else if (teamAFp > teamBFp) {
    outcome = "A_fp_tiebreak";
    teamAPts = cfg.splitWin;
    teamBPts = -cfg.splitLoss;
  } else if (teamBFp > teamAFp) {
    outcome = "B_fp_tiebreak";
    teamAPts = -cfg.splitLoss;
    teamBPts = cfg.splitWin;
  } else {
    outcome = "draw";
    teamAPts = 0;
    teamBPts = 0;
  }

  for (const m of cw.members) {
    result.set(String(m.userId), m.side === "A" ? teamAPts : teamBPts);
  }

  // ----- Captain + leader-topper bonuses -----
  const prevOrder = args.prevLeaderboardOrder ?? [];
  const { captainA, captainB } = await pickCaptains(
    cw.members.map((m) => ({ userId: m.userId, side: m.side })),
    prevOrder,
    args.matchId
  );
  const captainAFp = captainA ? fpMap.get(captainA) ?? 0 : 0;
  const captainBFp = captainB ? fpMap.get(captainB) ?? 0 : 0;
  let captainWinnerSide: "A" | "B" | null = null;
  if (captainA && captainB) {
    if (captainAFp > captainBFp) captainWinnerSide = "A";
    else if (captainBFp > captainAFp) captainWinnerSide = "B";
  }
  if (captainWinnerSide) {
    for (const m of cw.members) {
      if (m.side === captainWinnerSide) {
        const uid = String(m.userId);
        result.set(uid, (result.get(uid) ?? 0) + captainTeamWin);
      }
    }
  }

  // Leader-topper bonus: overall #1 pre-match, NOT in this match's civil war,
  // and his FP > both captains' FP.
  const memberIdSet = new Set(cw.members.map((m) => String(m.userId)));
  const overallLeaderId = prevOrder.find((id) => id) ?? null;
  let leaderTopperAwardedTo: string | null = null;
  let leaderTopperAwarded = 0;
  if (
    overallLeaderId &&
    !memberIdSet.has(overallLeaderId) &&
    captainA &&
    captainB
  ) {
    const leaderFp = fpMap.get(overallLeaderId) ?? 0;
    if (leaderFp > captainAFp && leaderFp > captainBFp) {
      leaderTopperAwardedTo = overallLeaderId;
      leaderTopperAwarded = leaderTopperBonus;
      result.set(
        overallLeaderId,
        (result.get(overallLeaderId) ?? 0) + leaderTopperBonus
      );
    }
  }

  cw.settled = true;
  cw.result = {
    teamAWinners,
    teamBWinners,
    teamAFp,
    teamBFp,
    outcome,
    teamAPointsPerMember: teamAPts,
    teamBPointsPerMember: teamBPts,
    captainAUserId: captainA
      ? (new mongoose.Types.ObjectId(captainA) as mongoose.Types.ObjectId)
      : null,
    captainBUserId: captainB
      ? (new mongoose.Types.ObjectId(captainB) as mongoose.Types.ObjectId)
      : null,
    captainAFp,
    captainBFp,
    captainWinnerSide,
    captainBonusPerMember: captainWinnerSide ? captainTeamWin : 0,
    leaderTopperUserId: leaderTopperAwardedTo
      ? (new mongoose.Types.ObjectId(leaderTopperAwardedTo) as mongoose.Types.ObjectId)
      : null,
    leaderTopperBonus: leaderTopperAwarded,
  };
  await cw.save();
  return result;
}
