import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { Prediction } from "@/models/Prediction";
import { PredictionAuditLog } from "@/models/PredictionAuditLog";
import mongoose from "mongoose";

/** Submit or update a prediction. Editable until the match starts (or admin lock). */
export async function submitPrediction(args: {
  userId: string;
  matchId: string;
  winner: string;
  topBatter: string;
  topBowler: string;
}) {
  await connectDB();
  const match = await Match.findById(args.matchId);
  if (!match) throw new Error("Match not found");
  if (match.predictionsLocked || match.startTime <= new Date()) {
    throw new Error("Predictions are locked for this match");
  }

  const existing = await Prediction.findOne({ matchId: args.matchId, userId: args.userId });
  const data = {
    winner: args.winner.trim(),
    topBatter: args.topBatter.trim(),
    topBowler: args.topBowler.trim(),
  };

  if (existing) {
    existing.set(data);
    await existing.save();
    await PredictionAuditLog.create({
      userId: args.userId,
      matchId: args.matchId,
      actionType: "update",
    });
    return existing;
  }

  const created = await Prediction.create({
    matchId: args.matchId,
    userId: args.userId,
    ...data,
  });
  await PredictionAuditLog.create({
    userId: args.userId,
    matchId: args.matchId,
    actionType: "submit",
  });
  return created;
}

/** Admin reset — only allowed before match starts. Admin cannot view actual choice. */
export async function adminResetPrediction(args: {
  adminId: string;
  matchId: string;
  userId: string;
}) {
  await connectDB();
  const match = await Match.findById(args.matchId);
  if (!match) throw new Error("Match not found");
  if (match.startTime <= new Date()) {
    throw new Error("Cannot reset predictions after match has started");
  }
  await Prediction.deleteOne({ matchId: args.matchId, userId: args.userId });
  await PredictionAuditLog.create({
    adminId: args.adminId,
    userId: args.userId,
    matchId: args.matchId,
    actionType: "admin_reset",
  });
}

/**
 * Aggregate-only suspense view: returns counts/percentages, never reveals
 * individual choices, until match is officially completed.
 */
export async function getPredictionSuspense(matchId: string) {
  await connectDB();
  const match = await Match.findById(matchId);
  if (!match) throw new Error("Match not found");
  const revealed = match.status === "completed";

  const totalCount = await Prediction.countDocuments({ matchId });

  const winnerAgg = await Prediction.aggregate([
    { $match: { matchId: new mongoose.Types.ObjectId(matchId) } },
    { $group: { _id: "$winner", count: { $sum: 1 } } },
  ]);
  const winnerSplit = winnerAgg.map((w) => ({
    choice: w._id,
    count: w.count,
    pct: totalCount ? Math.round((w.count / totalCount) * 100) : 0,
  }));

  if (!revealed) {
    return { revealed: false, totalCount, winnerSplit };
  }

  // Once match is completed, full predictions are public
  const all = await Prediction.find({ matchId }).populate("userId", "username userId").lean();
  return { revealed: true, totalCount, winnerSplit, predictions: all };
}
