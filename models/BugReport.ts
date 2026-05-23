import mongoose, { Schema, models, model } from "mongoose";

export type BugStatus = "open" | "in_progress" | "resolved" | "wont_fix";
export type BugSeverity = "low" | "medium" | "high";
export type BugSubmissionKind = "fixed" | "blocked" | "wont_fix";

export type BugActivityKind =
  | "comment"
  | "submission"
  | "request_changes"
  | "accept"
  | "reopen"
  | "assignment_change"
  | "status_change";

export interface IBugActivity {
  _id: mongoose.Types.ObjectId;
  at: Date;
  byId: mongoose.Types.ObjectId | null;
  byName: string;
  byHandle: string;
  kind: BugActivityKind;
  text?: string;
  meta?: Record<string, unknown>;
}

export interface IBugSubmission {
  kind: BugSubmissionKind;
  note: string;
  submittedAt: Date;
  submittedById: mongoose.Types.ObjectId;
  submittedByHandle: string;
  submittedByName: string;
}

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
  assignedTo?: mongoose.Types.ObjectId | null;
  assignedToHandle?: string | null;
  assignedToName?: string | null;
  assignedAt?: Date | null;
  assignedBy?: mongoose.Types.ObjectId | null;
  /** Legacy free-text note. New code reads `submission.note` instead. */
  resolutionNote?: string | null;
  /** Write-once outcome from the assignee. Cleared when admin reopens. */
  submission?: IBugSubmission | null;
  /** True after assignee submits anything until admin accepts or reopens. */
  needsAdminReview?: boolean;
  /** Conversation log: comments + lifecycle events. */
  activity: IBugActivity[];
  /** Optional screenshots attached by the reporter (data: URLs, max 3). */
  screenshots: string[];
  createdAt: Date;
  updatedAt: Date;
}

const BugSubmissionSchema = new Schema<IBugSubmission>(
  {
    kind: { type: String, enum: ["fixed", "blocked", "wont_fix"], required: true },
    note: { type: String, required: true, trim: true, maxlength: 4000 },
    submittedAt: { type: Date, required: true },
    submittedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submittedByHandle: { type: String, required: true },
    submittedByName: { type: String, required: true },
  },
  { _id: false },
);

const BugActivitySchema = new Schema<IBugActivity>(
  {
    at: { type: Date, required: true, default: () => new Date() },
    byId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, required: true },
    byHandle: { type: String, required: true },
    kind: {
      type: String,
      enum: [
        "comment",
        "submission",
        "request_changes",
        "accept",
        "reopen",
        "assignment_change",
        "status_change",
      ],
      required: true,
    },
    text: { type: String, default: "", maxlength: 4000 },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { _id: true, timestamps: false },
);

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
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assignedToHandle: { type: String, default: null },
    assignedToName: { type: String, default: null },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolutionNote: { type: String, default: null, maxlength: 4000 },
    submission: { type: BugSubmissionSchema, default: null },
    needsAdminReview: { type: Boolean, default: false, index: true },
    activity: { type: [BugActivitySchema], default: [] },
    screenshots: {
      type: [String],
      default: [],
      validate: {
        validator: (arr: string[]) => Array.isArray(arr) && arr.length <= 3,
        message: "Up to 3 screenshots allowed",
      },
    },
  },
  { timestamps: true }
);

BugReportSchema.index({ createdAt: -1 });
BugReportSchema.index({ assignedTo: 1, "submission.submittedAt": -1 });

export const BugReport =
  (models.BugReport as mongoose.Model<IBugReport>) ||
  model<IBugReport>("BugReport", BugReportSchema);

