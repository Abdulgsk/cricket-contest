import mongoose, { Schema, models, model } from "mongoose";

export interface IDailyFact {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  text: string;
  type: string; // "domination" | "comeback" | "streak" | "prediction" | "bounty" | ...
  score: number; // higher = more interesting
  userId?: mongoose.Types.ObjectId;
  /** Generation batch within a match. 1 for the first AI run, 2 for the next
   * regeneration, and so on. Older batches are kept in the DB for history but
   * the dashboard only displays the highest batchNumber for the latest match. */
  batchNumber: number;
  createdAt: Date;
}

const DailyFactSchema = new Schema<IDailyFact>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    text: { type: String, required: true },
    type: { type: String, required: true },
    score: { type: Number, default: 0, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    batchNumber: { type: Number, default: 1, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

DailyFactSchema.index({ createdAt: -1 });
DailyFactSchema.index({ matchId: 1, batchNumber: -1 });

export const DailyFact =
  (models.DailyFact as mongoose.Model<IDailyFact>) ||
  model<IDailyFact>("DailyFact", DailyFactSchema);
