import mongoose, { Schema, models, model } from "mongoose";

export interface ICustomPoolPrediction {
  _id: mongoose.Types.ObjectId;
  poolId: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  choice: string;
  scored: boolean;
  correct?: boolean;
  pointsAwarded: number;
  createdAt: Date;
  updatedAt: Date;
}

const Schema2 = new Schema<ICustomPoolPrediction>(
  {
    poolId: { type: Schema.Types.ObjectId, ref: "CustomPool", required: true, index: true },
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    choice: { type: String, required: true },
    scored: { type: Boolean, default: false },
    correct: { type: Boolean },
    pointsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
);

Schema2.index({ poolId: 1, userId: 1 }, { unique: true });

export const CustomPoolPrediction =
  (models.CustomPoolPrediction as mongoose.Model<ICustomPoolPrediction>) ||
  model<ICustomPoolPrediction>("CustomPoolPrediction", Schema2);
