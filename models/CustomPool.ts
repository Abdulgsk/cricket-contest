import mongoose, { Schema, models, model } from "mongoose";

export interface ICustomPool {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  question: string;
  options: string[];
  pointsValue: number; // points awarded for a correct pick
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
    correctOption: { type: String },
    scored: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const CustomPool =
  (models.CustomPool as mongoose.Model<ICustomPool>) ||
  model<ICustomPool>("CustomPool", CustomPoolSchema);
