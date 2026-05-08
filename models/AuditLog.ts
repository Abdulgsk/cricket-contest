import mongoose, { Schema, models, model } from "mongoose";

export interface IAuditLog {
  actorId?: mongoose.Types.ObjectId;
  action: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog =
  (models.AuditLog as mongoose.Model<IAuditLog>) ||
  model<IAuditLog>("AuditLog", AuditLogSchema);
