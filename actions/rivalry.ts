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
 *  - Otherwise the rivalry window stays open until the match's own startTime,
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
  if (Date.now() >= start.getTime()) {
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

/** Check if a user already has any pending/accepted rivalry for a match. */
async function userBusyOnMatch(matchId: string, userId: string) {
  return Rivalry.findOne({
    matchId,
    status: { $in: ["pending", "accepted"] },
    $or: [{ challengerId: userId }, { opponentId: userId }],
  }).lean();
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

  const myExisting = await userBusyOnMatch(matchId, String(me._id));
  if (myExisting) {
    return { ok: false as const, error: "You are already in a challenge for this match" };
  }
  const theirs = await userBusyOnMatch(matchId, opponentId);
  if (theirs) {
    return {
      ok: false as const,
      error: `${opponent.username} is already in a challenge for this match`,
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

  // If accepted, auto-decline any OTHER pending challenges sent to this opponent
  // for the same match, and notify each challenger so they can try someone else.
  if (accept) {
    const others = await Rivalry.find({
      _id: { $ne: riv._id },
      matchId: riv.matchId,
      opponentId: me._id,
      status: "pending",
    });
    for (const o of others) {
      o.status = "declined";
      await o.save();
      await Notification.create({
        userId: o.challengerId,
        title: "Rivalry unavailable",
        body: `${me.username} accepted another challenge for ${match.teamA} vs ${match.teamB}. Try challenging someone else.`,
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
  if (locked && reason === "started") {
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
      const busyIds = new Set<string>();
      for (const r of matchRivalries) {
        if (r.status === "pending" || r.status === "accepted") {
          busyIds.add(String(r.challengerId));
          busyIds.add(String(r.opponentId));
        }
      }
      const mine = matchRivalries.find(
        (r) =>
          (String(r.challengerId) === meId || String(r.opponentId) === meId) &&
          (r.status === "pending" || r.status === "accepted")
      );
      const minePending =
        mine && mine.status === "pending"
            ? {
              id: String(mine._id),
              role:
                String(mine.challengerId) === meId
                  ? ("challenger" as const)
                  : ("opponent" as const),
              opponent: {
                username:
                  String(mine.challengerId) === meId
                    ? userMap.get(String(mine.opponentId))?.username ?? ""
                    : userMap.get(String(mine.challengerId))?.username ?? "",
              },
            }
          : null;
      const mineAccepted =
        mine && mine.status === "accepted"
          ? {
              id: String(mine._id),
              opponent: {
                username:
                  String(mine.challengerId) === meId
                    ? userMap.get(String(mine.opponentId))?.username ?? ""
                    : userMap.get(String(mine.challengerId))?.username ?? "",
              },
            }
          : null;
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
          if (Date.now() >= start.getTime()) {
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
            if (busyIds.has(uid)) return false;
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
        // Players in a challenge already (for display)
        busyPlayers: users
          .filter((u) => busyIds.has(String(u._id)))
          .map((u) => ({ id: String(u._id), username: u.username })),
        myActive: mine
          ? {
              ...(minePending ?? mineAccepted ?? {}),
              status: mine.status,
            }
          : null,
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
