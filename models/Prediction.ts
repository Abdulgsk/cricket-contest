import mongoose, { Schema, models, model } from "mongoose";

export interface IPrediction {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  winner: string; // team name
  topBatter: string;
  topBowler: string;
  // Awarded once results entered
  pointsAwarded: number;
  scored: boolean;
  correctWinner?: boolean;
  correctBatter?: boolean;
  correctBowler?: boolean;
  allThreeBonus?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PredictionSchema = new Schema<IPrediction>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    winner: { type: String, required: true },
    topBatter: { type: String, required: true },
    topBowler: { type: String, required: true },
    pointsAwarded: { type: Number, default: 0 },
    scored: { type: Boolean, default: false },
    correctWinner: Boolean,
    correctBatter: Boolean,
    correctBowler: Boolean,
    allThreeBonus: Boolean,
  },
  { timestamps: true }
);

PredictionSchema.index({ matchId: 1, userId: 1 }, { unique: true });

export const Prediction =
  (models.Prediction as mongoose.Model<IPrediction>) ||
  model<IPrediction>("Prediction", PredictionSchema);
