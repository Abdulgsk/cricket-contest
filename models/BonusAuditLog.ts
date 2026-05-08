import mongoose, { Schema, models, model } from "mongoose";

export interface IBonusAuditLog {
  userId: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  bonusType: string;
  points: number;
  explanation: string;
  createdAt: Date;
}

const BonusAuditLogSchema = new Schema<IBonusAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    bonusType: { type: String, required: true },
    points: { type: Number, required: true },
    explanation: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const BonusAuditLog =
  (models.BonusAuditLog as mongoose.Model<IBonusAuditLog>) ||
  model<IBonusAuditLog>("BonusAuditLog", BonusAuditLogSchema);
