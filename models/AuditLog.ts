import mongoose, { Schema, models, model } from "mongoose";

export type AuditCategory = "create" | "update" | "delete" | "auth" | "action";

export interface IAuditLog {
  /** Mongo user._id of the actor (null for anonymous events like failed login). */
  actorId?: mongoose.Types.ObjectId | null;
  /** Display handle captured at the time of the event (survives user deletion). */
  actorHandle?: string | null;
  actorUsername?: string | null;
  /** Coarse bucket for filtering. */
  category?: AuditCategory;
  /** Dotted machine-readable action name, e.g. "user.role", "prediction.submit". */
  action: string;
  /** Optional target descriptor — what was changed (e.g. "User", "Match"). */
  targetType?: string | null;
  targetId?: string | null;
  /** Free-form details (diff, payload snippet, error reason, etc.). */
  meta?: Record<string, unknown>;
  /** Request context, best-effort. */
  ip?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorHandle: { type: String, default: null },
    actorUsername: { type: String, default: null },
    category: {
      type: String,
      enum: ["create", "update", "delete", "auth", "action"],
      default: "action",
      index: true,
    },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: null, index: true },
    targetId: { type: String, default: null, index: true },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });

export const AuditLog =
  (models.AuditLog as mongoose.Model<IAuditLog>) ||
  model<IAuditLog>("AuditLog", AuditLogSchema);
