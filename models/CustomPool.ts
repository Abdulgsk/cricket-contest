import mongoose, { Schema, models, model } from "mongoose";

export interface ICustomPool {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  question: string;
  options: string[];
  pointsValue: number; // points awarded for a correct pick
  /**
   * UTC timestamp after which no new picks / updates are accepted. Defaults
   * to the match start time when the pool is created. Required so that
   * pools are strictly time-bounded per match (no carry-over).
   */
  closesAt: Date;
  /**
   * One-shot stamp set when the "closing soon" reminder has been dispatched
   * to non-predictors. Prevents duplicate notifications.
   */
  deadlineNotifiedAt?: Date | null;
  correctOption?: string; // null until admin enters result
  scored: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomPoolSchema = new Schema<ICustomPool>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    question: { type: String, required: true, trim: true },
    options: { type: [String], required: true, validate: (v: string[]) => v.length >= 2 },
    pointsValue: { type: Number, default: 5, min: 1, max: 50 },
    closesAt: { type: Date, required: true, index: true },
    deadlineNotifiedAt: { type: Date, default: null },
    correctOption: { type: String },
    scored: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const CustomPool =
  (models.CustomPool as mongoose.Model<ICustomPool>) ||
  model<ICustomPool>("CustomPool", CustomPoolSchema);
