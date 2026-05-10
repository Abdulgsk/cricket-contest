import mongoose, { Schema, models, model } from "mongoose";

export type RivalryStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

export interface IRivalry {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  challengerId: mongoose.Types.ObjectId;
  opponentId: mongoose.Types.ObjectId;
  status: RivalryStatus;
  settled: boolean;
  winnerId?: mongoose.Types.ObjectId | null; // null = tie
  pointsAwarded: number; // 3 if settled with a winner
  cancelledBy?: mongoose.Types.ObjectId | null;
  pointsPenalty: number; // 1 if cancelled before match start (applied to cancelledBy)
  createdAt: Date;
  updatedAt: Date;
}

const RivalrySchema = new Schema<IRivalry>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    challengerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    opponentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired", "cancelled"],
      default: "pending",
      index: true,
    },
    settled: { type: Boolean, default: false, index: true },
    winnerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    pointsAwarded: { type: Number, default: 0 },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    pointsPenalty: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One row per (match, user) pair regardless of role so we can enforce the
// "one challenge per player per match" rule cheaply.
RivalrySchema.index({ matchId: 1, challengerId: 1 });
RivalrySchema.index({ matchId: 1, opponentId: 1 });

export const Rivalry =
  (models.Rivalry as mongoose.Model<IRivalry>) ||
  model<IRivalry>("Rivalry", RivalrySchema);
