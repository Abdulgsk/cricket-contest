import mongoose, { Schema, models, model } from "mongoose";

export interface IPredictionAuditLog {
  adminId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  actionType: "submit" | "update" | "admin_reset" | "auto_score";
  createdAt: Date;
}

const Schema2 = new Schema<IPredictionAuditLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    actionType: { type: String, enum: ["submit", "update", "admin_reset", "auto_score"], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PredictionAuditLog =
  (models.PredictionAuditLog as mongoose.Model<IPredictionAuditLog>) ||
  model<IPredictionAuditLog>("PredictionAuditLog", Schema2);
