"use server";

import { z } from "zod";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { requireUser, requireRole, requireAdminFeature, userHasFeature, assertFeature } from "@/lib/rbac";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { CivilWar } from "@/models/CivilWar";
import { Settings, invalidateSettingsCache } from "@/models/Settings";
import { AuditLog } from "@/models/AuditLog";
import { isModuleLocked } from "@/lib/match-locks";
import {
  attachRivalryToCivilWar as _attach,
  detachRivalryFromCivilWar as _detach,
  CIVIL_WAR_MIN_RIVALRIES,
} from "@/services/civil-war";

export async function attachRivalryToCivilWar(rivalry: {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  challengerId: mongoose.Types.ObjectId;
  opponentId: mongoose.Types.ObjectId;
}) {
  return _attach(rivalry);
}

export async function detachRivalryFromCivilWar(rivalry: {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
}) {
  return _detach(rivalry);
}

export type CivilWarMemberView = {
  userId: string;
  username: string;
  side: "A" | "B";
  isCaptain?: boolean;
};

export type CivilWarMatchView = {
  matchId: string;
  teamLabel: string;
  startTime: string;
  status: string;
  revealed: boolean;
  totalMembers: number;
  minRivalriesRequired: number;
  teamAName: string;
  teamBName: string;
  myUserId: string;
  mySide: "A" | "B" | null;
  amICaptain: boolean;
  captainAUserId: string | null;
  captainBUserId: string | null;
  members: CivilWarMemberView[] | null;
  settled: boolean;
  result: {
    teamAWinners: number;
    teamBWinners: number;
    teamAFp: number;
    teamBFp: number;
    outcome: string;
    teamAPointsPerMember: number;
    teamBPointsPerMember: number;
    captainAUserId: string | null;
    captainBUserId: string | null;
    captainAFp: number;
    captainBFp: number;
    captainWinnerSide: "A" | "B" | null;
    captainBonusPerMember: number;
    leaderTopperUserId: string | null;
    leaderTopperBonus: number;
  } | null;
  // Full breakdown for the rich "Civil War result" panel — only populated
  // when settled. Same shape as CivilWarHistoryEntry returned from
  // getMyRivalryAndCivilWarRecord, so the same component can render both.
  historyEntry: CivilWarHistoryEntry | null;
};

export async function getCivilWarView(): Promise<CivilWarMatchView[]> {
  const me = await requireUser();
  await connectDB();

  const myCwIds = await CivilWar.find({ "members.userId": me._id })
    .select("_id")
    .lean();
  if (myCwIds.length === 0) return [];

  const cws = await CivilWar.find({ _id: { $in: myCwIds.map((c) => c._id) } })
    .populate({ path: "matchId", model: Match })
    .lean();

  const allUserIds = new Set<string>();
  for (const cw of cws) for (const m of cw.members) allUserIds.add(String(m.userId));
  const users = await User.find({ _id: { $in: Array.from(allUserIds) } })
    .select("username avatar")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u.username]));
  const avatarMap = new Map(
    users.map((u) => [String(u._id), u.avatar ?? null])
  );

  // Per-user fantasy points for settled wars only — needed for the rich
  // result panel that shows the squad-by-squad FP table.
  const settledMatchIds: mongoose.Types.ObjectId[] = [];
  for (const cw of cws) {
    if (cw.settled && cw.result) {
      settledMatchIds.push(cw.matchId as unknown as mongoose.Types.ObjectId);
    }
  }
  const cwFpResults = settledMatchIds.length
    ? await (
        await import("@/models/MatchResult")
      ).MatchResult.find({
        matchId: { $in: settledMatchIds },
        userId: { $in: Array.from(allUserIds) },
      })
        .select("matchId userId fantasyPoints")
        .lean()
    : [];
  const cwFpMap = new Map<string, number>();
  for (const r of cwFpResults) {
    cwFpMap.set(`${String(r.matchId)}::${String(r.userId)}`, r.fantasyPoints ?? 0);
  }

  // Pre-match leaderboard order (best→worst) for captain computation.
  const { computeLeaderboard } = await import("@/services/scoring");

  const out: CivilWarMatchView[] = [];
  for (const cw of cws) {
    const match = cw.matchId as unknown as {
      _id: mongoose.Types.ObjectId;
      teamA: string;
      teamB: string;
      startTime: Date;
      status: string;
      rivalryLockExtensionMinutes?: number;
      rivalryLockExtensionAppliedAt?: Date | null;
    };
    if (!match || !match.startTime) continue;
    const revealed = isModuleLocked(match, "rivalry");
    const myMember = cw.members.find((m) => String(m.userId) === String(me._id));

    // Determine captains: stored on settled result; otherwise compute from
    // pre-match leaderboard (or current leaderboard for unfinished wars).
    let captainAId: string | null = cw.result?.captainAUserId
      ? String(cw.result.captainAUserId)
      : null;
    let captainBId: string | null = cw.result?.captainBUserId
      ? String(cw.result.captainBUserId)
      : null;
    if (!captainAId || !captainBId) {
      const { pickCaptains } = await import("@/services/civil-war");
      const prevLb = await computeLeaderboard({
        excludeMatchId: String(match._id),
      });
      const order = prevLb.map((r) => String(r.userId));
      const picked = await pickCaptains(
        cw.members.map((m) => ({ userId: m.userId, side: m.side })),
        order,
        String(match._id)
      );
      captainAId = captainAId ?? picked.captainA;
      captainBId = captainBId ?? picked.captainB;
    }

    const placeholderMembers = cw.members.map((m, idx) => ({
      userId: `hidden_${idx}`,
      username: "█████████",
      side: m.side,
    }));
    const realMembers = cw.members.map((m) => ({
      userId: String(m.userId),
      username: userMap.get(String(m.userId)) ?? "Unknown",
      side: m.side,
      isCaptain:
        (m.side === "A" && String(m.userId) === captainAId) ||
        (m.side === "B" && String(m.userId) === captainBId),
    }));
    const myId = String(me._id);
    const amICaptain = myId === captainAId || myId === captainBId;

    // Build the full historyEntry for settled wars so the rich result panel
    // can render in-line on the civil war tab (same component used in profile
    // and matches detail).
    let historyEntry: CivilWarHistoryEntry | null = null;
    if (cw.settled && cw.result && myMember) {
      const matchIdStr = String(match._id);
      const myPts =
        (myMember.side === "A"
          ? cw.result.teamAPointsPerMember
          : cw.result.teamBPointsPerMember) ?? 0;
      const wasCaptain =
        (myMember.side === "A" ? captainAId : captainBId) === myId;
      const captainBonusApplied =
        cw.result.captainWinnerSide === myMember.side &&
        (cw.result.captainBonusPerMember ?? 0) > 0;
      const totalWithBonus =
        myPts +
        (captainBonusApplied ? cw.result.captainBonusPerMember ?? 0 : 0);
      const buildHEMember = (m: {
        userId: mongoose.Types.ObjectId;
        side: "A" | "B";
      }) => {
        const uid = String(m.userId);
        return {
          userId: uid,
          username: userMap.get(uid) ?? "—",
          avatar: avatarMap.get(uid) ?? null,
          fantasyPoints: cwFpMap.get(`${matchIdStr}::${uid}`) ?? 0,
          isCaptain:
            uid === (m.side === "A" ? captainAId : captainBId),
          isMe: uid === myId,
        };
      };
      const heTeamA = cw.members
        .filter((m) => m.side === "A")
        .map(buildHEMember)
        .sort((a, b) => b.fantasyPoints - a.fantasyPoints);
      const heTeamB = cw.members
        .filter((m) => m.side === "B")
        .map(buildHEMember)
        .sort((a, b) => b.fantasyPoints - a.fantasyPoints);
      const leaderTopperId = cw.result.leaderTopperUserId
        ? String(cw.result.leaderTopperUserId)
        : null;
      historyEntry = {
        matchId: matchIdStr,
        matchLabel: `${match.teamA} vs ${match.teamB}`,
        startTime: new Date(match.startTime).toISOString(),
        mySide: myMember.side,
        myTeamName: myMember.side === "A" ? cw.teamAName : cw.teamBName,
        oppTeamName: myMember.side === "A" ? cw.teamBName : cw.teamAName,
        outcome: cw.result.outcome,
        myPoints: totalWithBonus,
        wasCaptain,
        captainBonusApplied,
        teamAName: cw.teamAName,
        teamBName: cw.teamBName,
        teamAPointsPerMember: cw.result.teamAPointsPerMember ?? 0,
        teamBPointsPerMember: cw.result.teamBPointsPerMember ?? 0,
        captainAUserId: captainAId,
        captainBUserId: captainBId,
        captainAFp: cw.result.captainAFp ?? 0,
        captainBFp: cw.result.captainBFp ?? 0,
        captainBonusPerMember: cw.result.captainBonusPerMember ?? 0,
        leaderTopperUserId: leaderTopperId,
        leaderTopperBonus: cw.result.leaderTopperBonus ?? 0,
        teamAMembers: heTeamA,
        teamBMembers: heTeamB,
        leaderTopperUsername: leaderTopperId
          ? userMap.get(leaderTopperId) ?? null
          : null,
      };
    }

    out.push({
      matchId: String(match._id),
      teamLabel: `${match.teamA} vs ${match.teamB}`,
      startTime: new Date(match.startTime).toISOString(),
      status: match.status,
      revealed,
      totalMembers: cw.members.length,
      minRivalriesRequired: CIVIL_WAR_MIN_RIVALRIES,
      teamAName: cw.teamAName,
      teamBName: cw.teamBName,
      myUserId: String(me._id),
      mySide: revealed && myMember ? myMember.side : null,
      amICaptain: revealed && amICaptain,
      captainAUserId: revealed ? captainAId : null,
      captainBUserId: revealed ? captainBId : null,
      members: revealed ? realMembers : placeholderMembers,
      settled: cw.settled,
      result: cw.result
        ? {
            teamAWinners: cw.result.teamAWinners,
            teamBWinners: cw.result.teamBWinners,
            teamAFp: cw.result.teamAFp,
            teamBFp: cw.result.teamBFp,
            outcome: cw.result.outcome,
            teamAPointsPerMember: cw.result.teamAPointsPerMember,
            teamBPointsPerMember: cw.result.teamBPointsPerMember,
            captainAUserId: cw.result.captainAUserId
              ? String(cw.result.captainAUserId)
              : null,
            captainBUserId: cw.result.captainBUserId
              ? String(cw.result.captainBUserId)
              : null,
            captainAFp: cw.result.captainAFp ?? 0,
            captainBFp: cw.result.captainBFp ?? 0,
            captainWinnerSide: cw.result.captainWinnerSide ?? null,
            captainBonusPerMember: cw.result.captainBonusPerMember ?? 0,
            leaderTopperUserId: cw.result.leaderTopperUserId
              ? String(cw.result.leaderTopperUserId)
              : null,
            leaderTopperBonus: cw.result.leaderTopperBonus ?? 0,
          }
        : null,
      historyEntry,
    });
  }

  out.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  return out;
}

const RenameSchema = z.object({
  matchId: z.string().min(1),
  side: z.enum(["A", "B"]),
  name: z.string().min(1).max(40),
});

export async function renameCivilWarTeamAction(payload: unknown) {
  const me = await requireUser();
  const parsed = RenameSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();
  const cw = await CivilWar.findOne({ matchId: parsed.data.matchId });
  if (!cw) return { ok: false as const, error: "Civil War not found" };
  const match = await Match.findById(cw.matchId)
    .select("startTime rivalryLockExtensionMinutes rivalryLockExtensionAppliedAt")
    .lean();
  if (!match) return { ok: false as const, error: "Match not found" };
  if (!isModuleLocked(match, "rivalry")) {
    return {
      ok: false as const,
      error: "Teams reveal at match start — rename unlocks then",
    };
  }
  const myMember = cw.members.find((m) => String(m.userId) === String(me._id));
  if (!myMember) return { ok: false as const, error: "You are not in this Civil War" };
  if (myMember.side !== parsed.data.side) {
    return { ok: false as const, error: "You can only rename your own team" };
  }

  // Captain check: only the leaderboard-top member of this side may rename.
  const { pickCaptains } = await import("@/services/civil-war");
  const { computeLeaderboard } = await import("@/services/scoring");
  const prevLb = await computeLeaderboard({ excludeMatchId: String(cw.matchId) });
  const { captainA, captainB } = await pickCaptains(
    cw.members.map((m) => ({ userId: m.userId, side: m.side })),
    prevLb.map((r) => String(r.userId)),
    String(cw.matchId)
  );
  const captainId = parsed.data.side === "A" ? captainA : captainB;
  if (!captainId || captainId !== String(me._id)) {
    return {
      ok: false as const,
      error: "Only this team's captain (leaderboard top on this side) can rename",
    };
  }

  const trimmed = parsed.data.name.trim();
  if (!trimmed) return { ok: false as const, error: "Name cannot be empty" };
  if (parsed.data.side === "A") cw.teamAName = trimmed;
  else cw.teamBName = trimmed;
  await cw.save();
  revalidatePath("/rivalry");
  return { ok: true as const };
}

const CivilWarSettingsSchema = z.object({
  decisiveWin: z.number().int().min(0).max(50),
  decisiveLoss: z.number().int().min(0).max(50),
  splitWin: z.number().int().min(0).max(50),
  splitLoss: z.number().int().min(0).max(50),
  captainTeamWin: z.number().int().min(0).max(50),
});

export async function updateCivilWarSettingsAction(payload: unknown) {
  const _auth = await assertFeature("civilwar.points.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = CivilWarSettingsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();
  const { captainTeamWin, ...civilWarConfig } = parsed.data;
  await Settings.updateOne(
    {},
    {
      $set: {
        civilWarConfig,
        "bonusConfig.captainTeamWin": captainTeamWin,
      },
    },
    { upsert: true }
  );
  invalidateSettingsCache();
  await AuditLog.create({
    actorId: me._id,
    action: "civilwar.settings",
    meta: parsed.data,
  });
  revalidatePath("/rivalry");
  revalidatePath("/rules");
  revalidatePath("/admin");
  return { ok: true as const };
}

export type RivalryHistoryEntry = {
  rivalryId: string;
  matchId: string;
  matchLabel: string;
  startTime: string;
  status: string;
  myRole: "challenger" | "opponent";
  opponentUserId: string;
  opponentUsername: string;
  opponentAvatar: string | null;
  outcome: "win" | "loss" | "tie" | "pending" | "cancelled";
  pointsAwarded: number;
  penalty: number;
  // Fantasy points for both players in this match — populated for settled
  // rivalries so the result UI can show "how he won" (FP diff). null when
  // the match isn't scored yet (pending/cancelled).
  myFp: number | null;
  opponentFp: number | null;
};

export type CivilWarHistoryEntry = {
  matchId: string;
  matchLabel: string;
  startTime: string;
  mySide: "A" | "B";
  myTeamName: string;
  oppTeamName: string;
  outcome: string;
  myPoints: number;
  wasCaptain: boolean;
  captainBonusApplied: boolean;
  // Full breakdown for the "reveal-like" results table.
  teamAName: string;
  teamBName: string;
  teamAPointsPerMember: number;
  teamBPointsPerMember: number;
  captainAUserId: string | null;
  captainBUserId: string | null;
  captainAFp: number;
  captainBFp: number;
  captainBonusPerMember: number;
  leaderTopperUserId: string | null;
  leaderTopperBonus: number;
  teamAMembers: Array<{
    userId: string;
    username: string;
    avatar: string | null;
    fantasyPoints: number;
    isCaptain: boolean;
    isMe: boolean;
  }>;
  teamBMembers: Array<{
    userId: string;
    username: string;
    avatar: string | null;
    fantasyPoints: number;
    isCaptain: boolean;
    isMe: boolean;
  }>;
  leaderTopperUsername: string | null;
};

export type RivalryRecord = {
  rivalry: {
    wins: number;
    losses: number;
    ties: number;
    pending: number;
    cancelled: number;
    adminWithdrawn: number;
    points: number;
  };
  civilWar: {
    wins: number;
    losses: number;
    draws: number;
    points: number;
  };
  recentRivalries: RivalryHistoryEntry[];
  recentCivilWars: CivilWarHistoryEntry[];
};

/**
 * Aggregate the current user's rivalry + civil war history (settled only for
 * record totals; recent lists include in-progress too).
 */
export async function getMyRivalryAndCivilWarRecord(
  forUserId?: string
): Promise<RivalryRecord> {
  const me = await requireUser();
  await connectDB();
  const userId = forUserId ?? String(me._id);

  const { Rivalry } = await import("@/models/Rivalry");

  const rivalries = await Rivalry.find({
    $or: [{ challengerId: userId }, { opponentId: userId }],
  })
    .populate({ path: "matchId", model: Match, select: "teamA teamB startTime status" })
    .populate({ path: "challengerId", model: User, select: "username avatar" })
    .populate({ path: "opponentId", model: User, select: "username avatar" })
    .sort({ createdAt: -1 })
    .lean();

  // Fantasy points lookup for both players in each rivalry's match — used to
  // show the FP diff ("how he won") in the rivalry result UI.
  const rivalryMatchIds: mongoose.Types.ObjectId[] = [];
  const rivalryUserIds = new Set<string>();
  for (const r of rivalries) {
    const match = r.matchId as unknown as { _id?: mongoose.Types.ObjectId } | null;
    if (match?._id) rivalryMatchIds.push(match._id);
    rivalryUserIds.add(String(r.challengerId?._id ?? r.challengerId));
    rivalryUserIds.add(String(r.opponentId?._id ?? r.opponentId));
  }
  const rivalryFpResults = rivalryMatchIds.length
    ? await (
        await import("@/models/MatchResult")
      ).MatchResult.find({
        matchId: { $in: rivalryMatchIds },
        userId: { $in: Array.from(rivalryUserIds) },
      })
        .select("matchId userId fantasyPoints")
        .lean()
    : [];
  const rivalryFpMap = new Map<string, number>();
  for (const r of rivalryFpResults) {
    rivalryFpMap.set(
      `${String(r.matchId)}::${String(r.userId)}`,
      r.fantasyPoints ?? 0
    );
  }

  const rivalryRecord = {
    wins: 0,
    losses: 0,
    ties: 0,
    pending: 0,
    cancelled: 0,
    adminWithdrawn: 0,
    points: 0,
  };
  const recentRivalries: RivalryHistoryEntry[] = [];
  for (const r of rivalries) {
    const match = r.matchId as unknown as {
      _id: mongoose.Types.ObjectId;
      teamA: string;
      teamB: string;
      startTime: Date;
      status: string;
    } | null;
    if (!match) continue;
    const isChallenger = String(r.challengerId._id ?? r.challengerId) === userId;
    const opponentDoc = isChallenger
      ? (r.opponentId as unknown as { username?: string; avatar?: string | null })
      : (r.challengerId as unknown as { username?: string; avatar?: string | null });

    // Admin-approved withdrawals are wiped from the summary entirely: no
    // penalty, no win/loss/tie/cancel bucket — they simply never happened.
    const isAdminApproved =
      r.status === "cancelled" && !!r.withdrawalApprovedAt;
    if (isAdminApproved) {
      rivalryRecord.adminWithdrawn += 1;
      continue;
    }

    let outcome: RivalryHistoryEntry["outcome"];
    if (r.status === "cancelled") outcome = "cancelled";
    else if (r.status !== "accepted") outcome = "pending";
    else if (!r.settled) outcome = "pending";
    else if (!r.winnerId) outcome = "tie";
    else if (String(r.winnerId) === userId) outcome = "win";
    else outcome = "loss";

    if (outcome === "win") {
      rivalryRecord.wins += 1;
      rivalryRecord.points += r.pointsAwarded ?? 0;
    } else if (outcome === "loss") {
      rivalryRecord.losses += 1;
    } else if (outcome === "tie") {
      rivalryRecord.ties += 1;
    } else if (outcome === "pending") {
      rivalryRecord.pending += 1;
    } else if (outcome === "cancelled") {
      rivalryRecord.cancelled += 1;
      // Self-withdraw: only the user who cancelled wears the -2 penalty.
      // pointsPenalty is already 0 for admin-approved (handled above).
      if (String(r.cancelledBy ?? "") === userId) {
        rivalryRecord.points -= r.pointsPenalty ?? 0;
      }
    }

    recentRivalries.push({
      rivalryId: String(r._id),
      matchId: String(match._id),
      matchLabel: `${match.teamA} vs ${match.teamB}`,
      startTime: new Date(match.startTime).toISOString(),
      status: r.status,
      myRole: isChallenger ? "challenger" : "opponent",
      opponentUserId: String(
        isChallenger
          ? (r.opponentId as { _id?: unknown } | null)?._id ?? r.opponentId
          : (r.challengerId as { _id?: unknown } | null)?._id ?? r.challengerId
      ),
      opponentUsername: opponentDoc?.username ?? "Unknown",
      opponentAvatar: opponentDoc?.avatar ?? null,
      outcome,
      pointsAwarded: outcome === "win" ? r.pointsAwarded ?? 0 : 0,
      penalty:
        outcome === "cancelled" && String(r.cancelledBy ?? "") === userId
          ? r.pointsPenalty ?? 0
          : 0,
      myFp: (() => {
        if (outcome !== "win" && outcome !== "loss" && outcome !== "tie") return null;
        const fp = rivalryFpMap.get(`${String(match._id)}::${userId}`);
        return typeof fp === "number" ? fp : null;
      })(),
      opponentFp: (() => {
        if (outcome !== "win" && outcome !== "loss" && outcome !== "tie") return null;
        const oppId = String(
          isChallenger
            ? r.opponentId?._id ?? r.opponentId
            : r.challengerId?._id ?? r.challengerId
        );
        const fp = rivalryFpMap.get(`${String(match._id)}::${oppId}`);
        return typeof fp === "number" ? fp : null;
      })(),
    });
  }

  // Civil War history
  const cws = await CivilWar.find({ "members.userId": userId, settled: true })
    .populate({ path: "matchId", model: Match, select: "teamA teamB startTime status" })
    .sort({ createdAt: -1 })
    .lean();

  // Batch-load all involved usernames + per-member FPs for all my settled wars.
  const cwUserIds = new Set<string>();
  const cwMatchIds: mongoose.Types.ObjectId[] = [];
  for (const cw of cws) {
    if (!cw.result) continue;
    for (const m of cw.members) cwUserIds.add(String(m.userId));
    if (cw.result.leaderTopperUserId) {
      cwUserIds.add(String(cw.result.leaderTopperUserId));
    }
    cwMatchIds.push(cw.matchId as unknown as mongoose.Types.ObjectId);
  }
  const [cwUsers, cwResults] = await Promise.all([
    cwUserIds.size > 0
      ? User.find({ _id: { $in: Array.from(cwUserIds) } })
          .select("username avatar")
          .lean()
      : Promise.resolve(
          [] as Array<{
            _id: mongoose.Types.ObjectId;
            username: string;
            avatar?: string | null;
          }>
        ),
    cwMatchIds.length > 0
      ? (
          await import("@/models/MatchResult")
        ).MatchResult.find({
          matchId: { $in: cwMatchIds },
          userId: { $in: Array.from(cwUserIds) },
        })
          .select("matchId userId fantasyPoints")
          .lean()
      : Promise.resolve(
          [] as Array<{
            matchId: mongoose.Types.ObjectId;
            userId: mongoose.Types.ObjectId;
            fantasyPoints: number;
          }>
        ),
  ]);
  const usernameMap = new Map(cwUsers.map((u) => [String(u._id), u.username]));
  const avatarMap = new Map(
    cwUsers.map((u) => [String(u._id), u.avatar ?? null])
  );
  const fpKey = (matchId: string, userId: string) => `${matchId}::${userId}`;
  const fpMap = new Map<string, number>();
  for (const r of cwResults) {
    fpMap.set(fpKey(String(r.matchId), String(r.userId)), r.fantasyPoints ?? 0);
  }

  const cwRecord = { wins: 0, losses: 0, draws: 0, points: 0 };
  const recentCivilWars: CivilWarHistoryEntry[] = [];
  for (const cw of cws) {
    const match = cw.matchId as unknown as {
      _id: mongoose.Types.ObjectId;
      teamA: string;
      teamB: string;
      startTime: Date;
      status: string;
    } | null;
    if (!match || !cw.result) continue;
    const myMember = cw.members.find((m) => String(m.userId) === userId);
    if (!myMember) continue;
    const mySide = myMember.side;
    const myPts =
      (mySide === "A"
        ? cw.result.teamAPointsPerMember
        : cw.result.teamBPointsPerMember) ?? 0;
    const captainAId = cw.result.captainAUserId
      ? String(cw.result.captainAUserId)
      : null;
    const captainBId = cw.result.captainBUserId
      ? String(cw.result.captainBUserId)
      : null;
    const wasCaptain =
      (mySide === "A" ? captainAId : captainBId) === userId;
    const captainBonusApplied =
      cw.result.captainWinnerSide === mySide &&
      (cw.result.captainBonusPerMember ?? 0) > 0;
    const totalWithBonus =
      myPts + (captainBonusApplied ? cw.result.captainBonusPerMember ?? 0 : 0);

    cwRecord.points += totalWithBonus;
    if (cw.result.outcome === "draw" || cw.result.outcome === "not_eligible") {
      cwRecord.draws += 1;
    } else if (
      (cw.result.outcome.startsWith("A_") && mySide === "A") ||
      (cw.result.outcome.startsWith("B_") && mySide === "B")
    ) {
      cwRecord.wins += 1;
    } else {
      cwRecord.losses += 1;
    }

    const matchIdStr = String(match._id);
    const buildMember = (m: { userId: mongoose.Types.ObjectId; side: "A" | "B"; rivalryId?: mongoose.Types.ObjectId }) => {
      const uid = String(m.userId);
      return {
        userId: uid,
        username: usernameMap.get(uid) ?? "—",
        avatar: avatarMap.get(uid) ?? null,
        fantasyPoints: fpMap.get(fpKey(matchIdStr, uid)) ?? 0,
        isCaptain: uid === (m.side === "A" ? captainAId : captainBId),
        isMe: uid === userId,
        rivalryId: m.rivalryId ? String(m.rivalryId) : null,
      };
    };
    
    // Build members with rivalry pairing information
    const allMembersA = cw.members
      .filter((m) => m.side === "A")
      .map(buildMember);
    const allMembersB = cw.members
      .filter((m) => m.side === "B")
      .map(buildMember);
    
    // Pair members by rivalryId, then sort pairs by combined FP
    const paired: Array<{ a: typeof allMembersA[0] | null; b: typeof allMembersB[0] | null }> = [];
    const usedA = new Set<string>();
    const usedB = new Set<string>();
    
    // First, pair up rivals
    for (const ma of allMembersA) {
      if (!ma.rivalryId) continue;
      const mb = allMembersB.find(m => m.rivalryId === ma.rivalryId);
      if (mb) {
        paired.push({ a: ma, b: mb });
        usedA.add(ma.userId);
        usedB.add(mb.userId);
      }
    }
    
    // Add unpaired members (captains without direct rivals)
    const unpairedA = allMembersA.filter(m => !usedA.has(m.userId));
    const unpairedB = allMembersB.filter(m => !usedB.has(m.userId));
    const maxUnpaired = Math.max(unpairedA.length, unpairedB.length);
    for (let i = 0; i < maxUnpaired; i++) {
      paired.push({
        a: unpairedA[i] || null,
        b: unpairedB[i] || null,
      });
    }
    
    // Sort pairs by combined fantasy points (highest first)
    paired.sort((p1, p2) => {
      const fp1 = (p1.a?.fantasyPoints || 0) + (p1.b?.fantasyPoints || 0);
      const fp2 = (p2.a?.fantasyPoints || 0) + (p2.b?.fantasyPoints || 0);
      return fp2 - fp1;
    });
    
    // Extract back to separate arrays for the component
    const teamAMembers = paired.map(p => p.a).filter((m): m is NonNullable<typeof m> => m !== null);
    const teamBMembers = paired.map(p => p.b).filter((m): m is NonNullable<typeof m> => m !== null);

    const leaderTopperId = cw.result.leaderTopperUserId
      ? String(cw.result.leaderTopperUserId)
      : null;

    recentCivilWars.push({
      matchId: matchIdStr,
      matchLabel: `${match.teamA} vs ${match.teamB}`,
      startTime: new Date(match.startTime).toISOString(),
      mySide,
      myTeamName: mySide === "A" ? cw.teamAName : cw.teamBName,
      oppTeamName: mySide === "A" ? cw.teamBName : cw.teamAName,
      outcome: cw.result.outcome,
      myPoints: totalWithBonus,
      wasCaptain,
      captainBonusApplied,
      teamAName: cw.teamAName,
      teamBName: cw.teamBName,
      teamAPointsPerMember: cw.result.teamAPointsPerMember ?? 0,
      teamBPointsPerMember: cw.result.teamBPointsPerMember ?? 0,
      captainAUserId: captainAId,
      captainBUserId: captainBId,
      captainAFp: cw.result.captainAFp ?? 0,
      captainBFp: cw.result.captainBFp ?? 0,
      captainBonusPerMember: cw.result.captainBonusPerMember ?? 0,
      leaderTopperUserId: leaderTopperId,
      leaderTopperBonus: cw.result.leaderTopperBonus ?? 0,
      teamAMembers,
      teamBMembers,
      leaderTopperUsername: leaderTopperId
        ? usernameMap.get(leaderTopperId) ?? null
        : null,
    });
  }

  return {
    rivalry: rivalryRecord,
    civilWar: cwRecord,
    recentRivalries: recentRivalries.slice(0, 50), 
    recentCivilWars: recentCivilWars.slice(0, 50), 
  };
}
