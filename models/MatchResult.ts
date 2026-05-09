import mongoose, { Schema, models, model } from "mongoose";

export interface IBonusBreakdown {
  type: string;
  points: number;
  reason: string;
}

export interface IMatchResult {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  rank: number; // 1..13, or 0 if missed
  fantasyPoints: number; // dream11 score
  missed: boolean;
  // Computed
  basePoints: number; // from rank table
  bonusPoints: number; // capped per match
  bountyPoints: number; // separate from bonuses
  penaltyPoints: number;
  finalPoints: number;
  bonuses: IBonusBreakdown[];
  penalties: IBonusBreakdown[];
  createdAt: Date;
  updatedAt: Date;
}

const BreakdownSchema = new Schema<IBonusBreakdown>(
  { type: String, points: Number, reason: String },
  { _id: false }
);

const MatchResultSchema = new Schema<IMatchResult>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rank: { type: Number, default: 0 },
    fantasyPoints: { type: Number, default: 0 },
    missed: { type: Boolean, default: false },
    basePoints: { type: Number, default: 0 },
    bonusPoints: { type: Number, default: 0 },
    bountyPoints: { type: Number, default: 0 },
    penaltyPoints: { type: Number, default: 0 },
    finalPoints: { type: Number, default: 0 },
    bonuses: { type: [BreakdownSchema], default: [] },
    penalties: { type: [BreakdownSchema], default: [] },
  },
  { timestamps: true }
);

MatchResultSchema.index({ matchId: 1, userId: 1 }, { unique: true });

export const MatchResult =
  (models.MatchResult as mongoose.Model<IMatchResult>) ||
  model<IMatchResult>("MatchResult", MatchResultSchema);
