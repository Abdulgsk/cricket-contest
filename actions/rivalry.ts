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
  const match = await Match.findById(matchId).select("startTime status teamA teamB").lean();
  if (!match) return { ok: false as const, error: "Match not found" };
  if (match.status !== "upcoming" || new Date(match.startTime) <= new Date()) {
    return { ok: false as const, error: "Match has already started" };
  }
  const opponent = await User.findById(opponentId).select("username").lean();
  if (!opponent) return { ok: false as const, error: "Opponent not found" };

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

  await Notification.create({
    userId: opponentId,
    title: "Rivalry challenge ⚔️",
    body: `${me.username} challenged you for ${match.teamA} vs ${match.teamB}. Open Rivalry tab to accept or decline.`,
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
  const match = await Match.findById(riv.matchId).select("startTime status teamA teamB").lean();
  if (!match) return { ok: false as const, error: "Match not found" };
  if (new Date(match.startTime) <= new Date()) {
    riv.status = "expired";
    await riv.save();
    return { ok: false as const, error: "Match already started" };
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

  const match = await Match.findById(riv.matchId).select("startTime teamA teamB").lean();
  if (!match) return { ok: false as const, error: "Match not found" };
  if (new Date(match.startTime) <= new Date()) {
    return { ok: false as const, error: "Match already started \u2014 challenges are locked" };
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
  const [rivalries, users] = await Promise.all([
    Rivalry.find({ matchId: { $in: matchIds } })
      .sort({ createdAt: -1 })
      .lean(),
    User.find().select("username userId").sort({ username: 1 }).lean(),
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const meId = String(me._id);

  // Users who already have any active (pending/accepted) rivalry across today's
  // listed matches — used to recommend "fresh" opponents in the dropdown.
  const globallyBusyIds = new Set<string>();
  for (const r of rivalries) {
    if (r.status === "pending" || r.status === "accepted") {
      globallyBusyIds.add(String(r.challengerId));
      globallyBusyIds.add(String(r.opponentId));
    }
  }

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
        matchStarted: new Date(m.startTime) <= new Date(),
        eligibleOpponents: users
          .filter((u) => String(u._id) !== meId && !busyIds.has(String(u._id)))
          .map((u) => ({
            id: String(u._id),
            username: u.username,
            handle: u.userId,
            // Recommended = no active rivalry across ANY of today's listed matches.
            recommended: !globallyBusyIds.has(String(u._id)),
          })),
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
