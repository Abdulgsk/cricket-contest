import mongoose, { Schema, models, model } from "mongoose";

export type BugStatus = "open" | "in_progress" | "resolved" | "wont_fix";
export type BugSeverity = "low" | "medium" | "high";

export interface IBugReport {
  _id: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  reporterHandle?: string;
  reporterName?: string;
  title: string;
  description: string;
  severity: BugSeverity;
  pageUrl?: string | null;
  userAgent?: string | null;
  status: BugStatus;
  adminNotes?: string | null;
  resolvedAt?: Date | null;
  resolvedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const BugReportSchema = new Schema<IBugReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reporterHandle: { type: String },
    reporterName: { type: String },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    pageUrl: { type: String, default: null },
    userAgent: { type: String, default: null },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "wont_fix"],
      default: "open",
      index: true,
    },
    adminNotes: { type: String, default: null, maxlength: 2000 },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

BugReportSchema.index({ createdAt: -1 });

export const BugReport =
  (models.BugReport as mongoose.Model<IBugReport>) ||
  model<IBugReport>("BugReport", BugReportSchema);
