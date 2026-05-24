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
  | "status_change"
  | "due_change"
  | "system";

/** A single emoji reaction on a comment/activity entry. */
export interface IBugReaction {
  emoji: string;
  byId: mongoose.Types.ObjectId;
  byHandle: string;
  byName: string;
  at: Date;
}

export interface IBugActivity {
  _id: mongoose.Types.ObjectId;
  at: Date;
  byId: mongoose.Types.ObjectId | null;
  byName: string;
  byHandle: string;
  kind: BugActivityKind;
  text?: string;
  meta?: Record<string, unknown>;
  /** @userhandle references resolved at write-time so the thread stays stable. */
  mentions?: Array<{ userId: mongoose.Types.ObjectId; handle: string; name: string }>;
  /** Emoji reactions (👍 ❤️ 🎉 👋 🚀 👀). */
  reactions?: IBugReaction[];
  /** Edit history — last edit timestamp; if set, UI shows "edited". */
  editedAt?: Date | null;
  /** Soft-delete: when set the row is rendered as a tombstone and locked. */
  deletedAt?: Date | null;
  deletedById?: mongoose.Types.ObjectId | null;
  deletedByName?: string | null;
  deletedByHandle?: string | null;
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
  /** Auto-captured runtime context from the reporter's browser. */
  browserContext?: {
    viewport?: { w: number; h: number } | null;
    devicePixelRatio?: number | null;
    locale?: string | null;
    timezone?: string | null;
    theme?: string | null;
    referrer?: string | null;
    consoleErrors?: Array<{ at: string; msg: string }>;
    buildId?: string | null;
  } | null;
  /** Optional admin-set SLA / due target. */
  dueAt?: Date | null;
  /** Soft-link to related bugs (chosen via duplicate detection). */
  relatedTo?: mongoose.Types.ObjectId[];
  /** Per-user last-read marker for unread badges. */
  viewerState?: Map<string, { lastReadAt: Date }>;
  /** Soft-delete: when set, the bug is hidden from queues but kept for audit. */
  deletedAt?: Date | null;
  deletedById?: mongoose.Types.ObjectId | null;
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

const BugReactionSchema = new Schema<IBugReaction>(
  {
    emoji: { type: String, required: true, maxlength: 8 },
    byId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    byHandle: { type: String, required: true },
    byName: { type: String, required: true },
    at: { type: Date, required: true, default: () => new Date() },
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
        "due_change",
        "system",
      ],
      required: true,
    },
    text: { type: String, default: "", maxlength: 4000 },
    meta: { type: Schema.Types.Mixed, default: null },
    mentions: {
      type: [
        new Schema(
          {
            userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
            handle: { type: String, required: true },
            name: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    reactions: { type: [BugReactionSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    deletedByName: { type: String, default: null },
    deletedByHandle: { type: String, default: null },
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
    browserContext: { type: Schema.Types.Mixed, default: null },
    dueAt: { type: Date, default: null, index: true },
    relatedTo: { type: [Schema.Types.ObjectId], ref: "BugReport", default: [] },
    viewerState: {
      type: Map,
      of: new Schema(
        { lastReadAt: { type: Date, required: true } },
        { _id: false },
      ),
      default: () => new Map(),
    },
    deletedAt: { type: Date, default: null, index: true },
    deletedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

BugReportSchema.index({ createdAt: -1 });
BugReportSchema.index({ assignedTo: 1, "submission.submittedAt": -1 });
BugReportSchema.index({ status: 1, severity: 1, createdAt: -1 });

export const BugReport =
  (models.BugReport as mongoose.Model<IBugReport>) ||
  model<IBugReport>("BugReport", BugReportSchema);

