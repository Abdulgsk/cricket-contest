"use server";

import { z } from "zod";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { Rivalry } from "@/models/Rivalry";
import { Notification } from "@/models/Notification";
import { isModuleLocked } from "@/lib/match-locks";

const CreateSchema = z.object({
  matchId: z.string().min(1),
  opponentId: z.string().min(1),
});

type LockReason = "waiting_prior" | "started" | null;

/**
 * Compute rivalry lock state for a match.
 * Rules:
 *  - If any earlier match on the same calendar day has NOT had results entered
 *    yet, this match's rivalries are locked (reason: "waiting_prior") — the
 *    next match "hasn't started" until the previous one is resolved.
 *  - Otherwise the rivalry window stays open until the match's own startTime +
 *    rivalry extension,
 *    then locks (reason: "started").
 */
async function getMatchLockInfo(matchId: string): Promise<{
  match: { startTime: Date; status: string; teamA: string; teamB: string };
  locked: boolean;
  reason: LockReason;
  unfinishedPriors: { teamA: string; teamB: string }[];
} | null> {
  const match = await Match.findById(matchId)
    .select("startTime status teamA teamB")
    .lean();
  if (!match) return null;
  const start = new Date(match.startTime);
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);
  const sameDay = await Match.find({
    _id: { $ne: match._id },
    startTime: { $gte: dayStart, $lte: dayEnd },
  })
    .select("startTime teamA teamB resultsEntered")
    .lean();
  const unfinishedPriors = sameDay
    .filter(
      (m) =>
        new Date(m.startTime).getTime() < start.getTime() && !m.resultsEntered
    )
    .map((m) => ({ teamA: m.teamA, teamB: m.teamB }));
  if (unfinishedPriors.length > 0) {
    return { match, locked: true, reason: "waiting_prior", unfinishedPriors };
  }
  if (isModuleLocked(match, "rivalry")) {
    return { match, locked: true, reason: "started", unfinishedPriors: [] };
  }
  return { match, locked: false, reason: null, unfinishedPriors: [] };
}

/** Maximum lifetime rivalries between any two players (challenge + revenge). */
const MAX_RIVALRIES_PER_PAIR = 2;

/** Count rivalries between a pair that consumed a slot (anything not declined/cancelled). */
async function countActiveRivalriesBetween(a: string, b: string): Promise<number> {
  return Rivalry.countDocuments({
    status: { $nin: ["declined", "cancelled"] },
    $or: [
      { challengerId: a, opponentId: b },
      { challengerId: b, opponentId: a },
    ],
  });
}

async function withdrawRivalryNoPenalty(riv: {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  challengerId: mongoose.Types.ObjectId;
  opponentId: mongoose.Types.ObjectId;
  status: string;
  withdrawalRequestedBy?: mongoose.Types.ObjectId | null;
  withdrawalRequestedAt?: Date | null;
  withdrawalApprovedBy?: mongoose.Types.ObjectId | null;
  withdrawalApprovedAt?: Date | null;
  cancelledBy?: mongoose.Types.ObjectId | null;
  pointsPenalty?: number;
  save: () => Promise<unknown>;
}) {
  riv.status = "cancelled";
  riv.pointsPenalty = 0;
  riv.cancelledBy = null;
  riv.withdrawalRequestedBy = null;
  riv.withdrawalRequestedAt = null;
  riv.withdrawalApprovedBy = null;
  riv.withdrawalApprovedAt = null;
  await riv.save();
}

export async function createRivalryAction(payload: unknown) {
  const me = await requireUser();
  const parsed = CreateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  const { matchId, opponentId } = parsed.data;
  if (String(me._id) === opponentId) {
    return { ok: false as const, error: "You can't challenge yourself" };
  }

  await connectDB();
  const info = await getMatchLockInfo(matchId);
  if (!info) return { ok: false as const, error: "Match not found" };
  const { match, locked, reason, unfinishedPriors } = info;
  if (match.status === "completed" || locked) {
    if (reason === "waiting_prior") {
      const p = unfinishedPriors[0];
      return {
        ok: false as const,
        error: p
          ? `Wait for ${p.teamA} vs ${p.teamB} results before challenging for this match.`
          : "Wait for the earlier match's results before challenging.",
      };
    }
    return { ok: false as const, error: "Rivalries are locked for this match" };
  }
  const opponent = await User.findById(opponentId).select("username").lean();
  if (!opponent) return { ok: false as const, error: "Opponent not found" };

  // Enforce “challenge + revenge” cap (max 2 lifetime rivalries between this pair).
  const priorCount = await countActiveRivalriesBetween(String(me._id), opponentId);
  if (priorCount >= MAX_RIVALRIES_PER_PAIR) {
    return {
      ok: false as const,
      error: `You’ve already used your challenge and revenge against ${opponent.username}.`,
    };
  }

  const created = await Rivalry.create({
    matchId,
    challengerId: me._id,
    opponentId,
    status: "pending",
  });

  const isRevenge = priorCount === 1;
  await Notification.create({
    userId: opponentId,
    title: isRevenge ? "Revenge challenge \u2694\ufe0f" : "Rivalry challenge \u2694\ufe0f",
    body: `${me.username} ${
      isRevenge ? "wants revenge" : "challenged you"
    } for ${match.teamA} vs ${match.teamB}. Open Rivalry tab to accept or decline.`,
  });

  revalidatePath("/rivalry");
  return { ok: true as const, id: String(created._id) };
}

const RespondSchema = z.object({
  rivalryId: z.string().min(1),
  accept: z.boolean(),
});

export async function respondRivalryAction(payload: unknown) {
  const me = await requireUser();
  const parsed = RespondSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  const { rivalryId, accept } = parsed.data;
  await connectDB();
  const riv = await Rivalry.findById(rivalryId);
  if (!riv) return { ok: false as const, error: "Challenge not found" };
  if (String(riv.opponentId) !== String(me._id)) {
    return { ok: false as const, error: "Only the challenged player can respond" };
  }
  if (riv.status !== "pending") {
    return { ok: false as const, error: "This challenge is no longer pending" };
  }
  const info = await getMatchLockInfo(String(riv.matchId));
  if (!info) return { ok: false as const, error: "Match not found" };
  const { match, locked, reason } = info;
  if (locked) {
    // Only mark expired if the match itself has started — not when waiting
    // for a prior match's results (challenges shouldn't even exist yet then).
    if (reason === "started") {
      riv.status = "expired";
      await riv.save();
    }
    return { ok: false as const, error: "Rivalries are locked for this match" };
  }

  riv.status = accept ? "accepted" : "declined";
  await riv.save();

  await Notification.create({
    userId: riv.challengerId,
    title: accept ? "Rivalry accepted ⚔️" : "Rivalry declined",
    body: accept
      ? `${me.username} accepted your challenge for ${match.teamA} vs ${match.teamB}.`
      : `${me.username} declined your challenge for ${match.teamA} vs ${match.teamB}.`,
  });

  // If accepted, auto-withdraw any OTHER pending challenges involving either of
  // these players for the same match, without a penalty.
  if (accept) {
    const others = await Rivalry.find({
      _id: { $ne: riv._id },
      matchId: riv.matchId,
      $or: [
        { challengerId: riv.challengerId },
        { opponentId: riv.challengerId },
        { challengerId: riv.opponentId },
        { opponentId: riv.opponentId },
      ],
      status: "pending",
    });
    for (const o of others) {
      await withdrawRivalryNoPenalty(o);
      await Notification.create({
        userId: o.challengerId,
        title: "Rivalry withdrawn",
        body: `${me.username} accepted a challenge for ${match.teamA} vs ${match.teamB}. Your other challenge was withdrawn without penalty.`,
      });
    }
  }

  revalidatePath("/rivalry");
  return { ok: true as const };
}

const CancelSchema = z.object({ rivalryId: z.string().min(1) });

export async function cancelRivalryAction(payload: unknown) {
  const me = await requireUser();
  const parsed = CancelSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();
  const riv = await Rivalry.findById(parsed.data.rivalryId);
  if (!riv) return { ok: false as const, error: "Challenge not found" };

  const meId = String(me._id);
  const isChallenger = String(riv.challengerId) === meId;
  const isOpponent = String(riv.opponentId) === meId;
  if (!isChallenger && !isOpponent) {
    return { ok: false as const, error: "You are not part of this challenge" };
  }
  if (riv.status !== "pending" && riv.status !== "accepted") {
    return { ok: false as const, error: "This challenge can no longer be withdrawn" };
  }

  const info = await getMatchLockInfo(String(riv.matchId));
  if (!info) return { ok: false as const, error: "Match not found" };
  const { match, locked, reason } = info;
  if (locked) {
    return { ok: false as const, error: "Match locked \u2014 challenges can no longer be withdrawn" };
  }

  const wasAccepted = riv.status === "accepted";
  riv.status = "cancelled";
  riv.cancelledBy = me._id as unknown as typeof riv.cancelledBy;
  // Only penalise withdrawals from a real (pending or accepted) challenge.
  riv.pointsPenalty = 2;
  await riv.save();

  const otherUserId = isChallenger ? riv.opponentId : riv.challengerId;
  await Notification.create({
    userId: otherUserId,
    title: "Rivalry withdrawn",
    body: `${me.username} withdrew ${
      wasAccepted ? "the" : "their"
    } challenge for ${match.teamA} vs ${match.teamB}.`,
  });
  await Notification.create({
    userId: me._id,
    title: "Challenge withdrawn",
    body: `You withdrew the challenge for ${match.teamA} vs ${match.teamB}. \u22122 points applied.`,
  });

  revalidatePath("/rivalry");
  return { ok: true as const };
}

const RequestWithdrawSchema = z.object({ rivalryId: z.string().min(1) });

export async function requestRivalryWithdrawalAction(payload: unknown) {
  const me = await requireUser();
  const parsed = RequestWithdrawSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();
  const riv = await Rivalry.findById(parsed.data.rivalryId);
  if (!riv) return { ok: false as const, error: "Challenge not found" };
  const meId = String(me._id);
  if (String(riv.challengerId) !== meId && String(riv.opponentId) !== meId) {
    return { ok: false as const, error: "You are not part of this challenge" };
  }
  // Admin-approved withdrawal requests are allowed even after rivalry lock —
  // the admin makes the final call, so players can ask at any time while the
  // challenge is still active.
  const info = await getMatchLockInfo(String(riv.matchId));
  if (!info) return { ok: false as const, error: "Match not found" };
  if (riv.status !== "pending" && riv.status !== "accepted") {
    return { ok: false as const, error: "This challenge can no longer be withdrawn" };
  }
  if (riv.withdrawalRequestedBy && !riv.withdrawalApprovedAt) {
    return { ok: false as const, error: "Withdrawal already requested — waiting for admin" };
  }
  riv.withdrawalRequestedBy = me._id as unknown as typeof riv.withdrawalRequestedBy;
  riv.withdrawalRequestedAt = new Date();
  riv.withdrawalApprovedBy = null;
  riv.withdrawalApprovedAt = null;
  await riv.save();

  await Notification.create({
    userId: riv.challengerId,
    title: "Withdrawal requested",
    body: `${me.username} asked for admin approval to withdraw a rivalry for this match.`,
  });
  await Notification.create({
    userId: riv.opponentId,
    title: "Withdrawal requested",
    body: `${me.username} asked for admin approval to withdraw a rivalry for this match.`,
  });
  revalidatePath("/rivalry");
  revalidatePath("/admin");
  return { ok: true as const };
}

const AdminWithdrawSchema = z.object({
  rivalryId: z.string().min(1),
  approve: z.boolean(),
});

export async function adminResolveRivalryWithdrawalAction(payload: unknown) {
  const admin = await requireUser();
  if (admin.role !== "admin" && admin.role !== "superadmin") {
    return { ok: false as const, error: "Admin access required" };
  }
  const parsed = AdminWithdrawSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();
  const riv = await Rivalry.findById(parsed.data.rivalryId);
  if (!riv) return { ok: false as const, error: "Challenge not found" };
  const requesterId = riv.withdrawalRequestedBy;
  if (!riv.withdrawalRequestedAt || !requesterId) {
    return { ok: false as const, error: "No withdrawal request to review" };
  }
  if (!parsed.data.approve) {
    riv.withdrawalRequestedBy = null;
    riv.withdrawalRequestedAt = null;
    await riv.save();
    await Notification.create({
      userId: requesterId,
      title: "Withdrawal denied",
      body: "An admin did not approve your rivalry withdrawal request.",
    });
    revalidatePath("/admin");
    revalidatePath("/rivalry");
    return { ok: true as const };
  }

  const participantIds = [String(riv.challengerId), String(riv.opponentId)];
  const related = await Rivalry.find({
    _id: { $ne: riv._id },
    matchId: riv.matchId,
    status: { $in: ["pending", "accepted"] },
    $or: [
      { challengerId: { $in: participantIds } },
      { opponentId: { $in: participantIds } },
    ],
  });

  await withdrawRivalryNoPenalty(riv);
  riv.withdrawalApprovedBy = admin._id as unknown as typeof riv.withdrawalApprovedBy;
  riv.withdrawalApprovedAt = new Date();
  riv.cancelledBy = requesterId;
  await riv.save();

  for (const other of related) {
    await withdrawRivalryNoPenalty(other);
  }

  await Notification.create({
    userId: riv.challengerId,
    title: "Withdrawal approved",
    body: "An admin approved the rivalry withdrawal. No penalty was applied.",
  });
  await Notification.create({
    userId: riv.opponentId,
    title: "Withdrawal approved",
    body: "An admin approved the rivalry withdrawal. No penalty was applied.",
  });

  for (const other of related) {
    await Notification.create({
      userId: other.challengerId,
      title: "Rivalry withdrawn",
      body: "A related rivalry withdrawal was approved by admin. Your pending/active challenge for this match was withdrawn without penalty.",
    });
    await Notification.create({
      userId: other.opponentId,
      title: "Rivalry withdrawn",
      body: "A related rivalry withdrawal was approved by admin. Your pending/active challenge for this match was withdrawn without penalty.",
    });
  }

  revalidatePath("/admin");
  revalidatePath("/rivalry");
  revalidatePath("/leaderboard");
  return { ok: true as const };
}

/** Server-rendered view model for /rivalry */
export async function getRivalryView() {
  const me = await requireUser();
  await connectDB();

  // Mark rivalry tab as seen now (so the nav dot clears once the user opens it).
  await User.updateOne({ _id: me._id }, { $set: { lastSeenRivalryAt: new Date() } });

  // Today window: from now until end of day local-server time.
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // Show all not-yet-started matches today + currently live ones that have no result yet.
  const matches = await Match.find({
    startTime: { $lte: endOfDay },
    status: { $in: ["upcoming", "live"] },
    resultsEntered: { $ne: true },
  })
    .sort({ startTime: 1 })
    .lean();

  const matchIds = matches.map((m) => new mongoose.Types.ObjectId(String(m._id)));

  // For lock detection we also need same-day matches that are ALREADY completed
  // (so we can tell whether priors are done). Build a wider day window covering
  // all visible matches and pull every match in that range.
  let dayMatches: {
    _id: mongoose.Types.ObjectId;
    startTime: Date;
    teamA: string;
    teamB: string;
    resultsEntered: boolean;
  }[] = [];
  if (matches.length) {
    const minDayStart = new Date(matches[0].startTime);
    minDayStart.setHours(0, 0, 0, 0);
    const maxDayEnd = new Date(matches[matches.length - 1].startTime);
    maxDayEnd.setHours(23, 59, 59, 999);
    dayMatches = await Match.find({
      startTime: { $gte: minDayStart, $lte: maxDayEnd },
    })
      .select("startTime teamA teamB resultsEntered")
      .lean();
  }
  const dayMap = new Map<string, typeof dayMatches>();
  for (const dm of dayMatches) {
    const s = new Date(dm.startTime);
    const k = `${s.getFullYear()}-${s.getMonth()}-${s.getDate()}`;
    const arr = dayMap.get(k) ?? [];
    arr.push(dm);
    dayMap.set(k, arr);
  }
  const [rivalries, allHistoric, users] = await Promise.all([
    Rivalry.find({ matchId: { $in: matchIds } })
      .sort({ createdAt: -1 })
      .lean(),
    // All lifetime rivalries involving me that consumed a slot — used to
    // enforce the “max 2 challenges per pair” rule (challenge + revenge).
    Rivalry.find({
      status: { $nin: ["declined", "cancelled"] },
      $or: [{ challengerId: me._id }, { opponentId: me._id }],
    })
      .select("challengerId opponentId")
      .lean(),
    User.find().select("username userId").sort({ username: 1 }).lean(),
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const meId = String(me._id);

  // Count of historic rivalries between me and each other user.
  const pairCount = new Map<string, number>();
  for (const r of allHistoric) {
    const other =
      String(r.challengerId) === meId
        ? String(r.opponentId)
        : String(r.challengerId);
    pairCount.set(other, (pairCount.get(other) ?? 0) + 1);
  }

  // For computing lock state per match (need siblings on the same calendar day).
  // (dayMap built above already covers this.)

  return {
    meId,
    matches: matches.map((m) => {
      const matchRivalries = rivalries.filter(
        (r) => String(r.matchId) === String(m._id)
      );
      const myRivalries = matchRivalries
        .filter(
          (r) =>
            (String(r.challengerId) === meId || String(r.opponentId) === meId) &&
            (r.status === "pending" || r.status === "accepted")
        )
        .map((r) => ({
          id: String(r._id),
          status: r.status,
          role:
            String(r.challengerId) === meId ? ("challenger" as const) : ("opponent" as const),
          opponent: {
            username:
              String(r.challengerId) === meId
                ? userMap.get(String(r.opponentId))?.username ?? ""
                : userMap.get(String(r.challengerId))?.username ?? "",
          },
          withdrawalRequestedAt: r.withdrawalRequestedAt ?? null,
          withdrawalRequestedBy: r.withdrawalRequestedBy ? String(r.withdrawalRequestedBy) : null,
        }));
      return {
        id: String(m._id),
        teamA: m.teamA,
        teamB: m.teamB,
        startTime: m.startTime,
        status: m.status,
        ...(() => {
          const start = new Date(m.startTime);
          const dayKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
          const siblings = dayMap.get(dayKey) ?? [];
          const unfinishedPriors = siblings
            .filter(
              (s) =>
                String(s._id) !== String(m._id) &&
                new Date(s.startTime).getTime() < start.getTime() &&
                !s.resultsEntered
            )
            .map((s) => ({ teamA: s.teamA, teamB: s.teamB }));
          if (unfinishedPriors.length > 0) {
            return {
              rivalryLocked: true,
              rivalryLockReason: "waiting_prior" as const,
              unfinishedPriors,
            };
          }
          if (isModuleLocked(m, "rivalry")) {
            return {
              rivalryLocked: true,
              rivalryLockReason: "started" as const,
              unfinishedPriors: [],
            };
          }
          return {
            rivalryLocked: false,
            rivalryLockReason: null,
            unfinishedPriors: [],
          };
        })(),
        eligibleOpponents: users
          .filter((u) => {
            const uid = String(u._id);
            if (uid === meId) return false;
            // Hide opponents we’ve already maxed (challenge + revenge done).
            if ((pairCount.get(uid) ?? 0) >= MAX_RIVALRIES_PER_PAIR) return false;
            return true;
          })
          .map((u) => {
            const uid = String(u._id);
            const prior = pairCount.get(uid) ?? 0;
            return {
              id: uid,
              username: u.username,
              handle: u.userId,
              isRevenge: prior === 1,
            };
          }),
        // All of my active challenges for this match (may be multiple now)
        myRivalries,
        all: matchRivalries.map((r) => ({
          id: String(r._id),
          challenger: userMap.get(String(r.challengerId))?.username ?? "—",
          opponent: userMap.get(String(r.opponentId))?.username ?? "—",
          status: r.status,
        })),
      };
    }),
  };
}

/**
 * Count rivalry events the user hasn't seen yet (i.e. updated after their
 * lastSeenRivalryAt timestamp). Used to render a dot on the Rivalry nav link.
 */
export async function getUnseenRivalryCount(userId: string): Promise<number> {
  await connectDB();
  const user = await User.findById(userId).select("lastSeenRivalryAt").lean();
  const since = user?.lastSeenRivalryAt ?? new Date(0);
  // Anything involving me that was updated after I last visited the tab.
  return Rivalry.countDocuments({
    $or: [{ challengerId: userId }, { opponentId: userId }],
    updatedAt: { $gt: since },
  });
}
