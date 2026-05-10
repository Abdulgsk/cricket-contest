import mongoose, { Schema, models, model } from "mongoose";

export interface IDailyFact {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  text: string;
  type: string; // "domination" | "comeback" | "streak" | "prediction" | "bounty" | ...
  score: number; // higher = more interesting
  userId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const DailyFactSchema = new Schema<IDailyFact>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    text: { type: String, required: true },
    type: { type: String, required: true },
    score: { type: Number, default: 0, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

DailyFactSchema.index({ createdAt: -1 });

export const DailyFact =
  (models.DailyFact as mongoose.Model<IDailyFact>) ||
  model<IDailyFact>("DailyFact", DailyFactSchema);
