import mongoose, { Schema, models, model } from "mongoose";

export type WorkItemStatus = "open" | "in_progress" | "blocked" | "done";
export type WorkItemPriority = "low" | "medium" | "high";
export type WorkItemSubmissionKind = "done" | "blocked" | "wont_do";

export type WorkItemActivityKind =
  | "comment"
  | "submission"
  | "request_changes"
  | "accept"
  | "reopen"
  | "assignment_change"
  | "status_change"
  | "due_change"
  | "tag_change"
  | "subtask_change"
  | "attachment_change"
  | "points_change";

export interface IWorkItemSubtask {
  _id: mongoose.Types.ObjectId;
  text: string;
  done: boolean;
  addedAt: Date;
  addedById: mongoose.Types.ObjectId | null;
  addedByName: string;
  doneAt?: Date | null;
  doneById?: mongoose.Types.ObjectId | null;
  doneByName?: string | null;
}

export interface IWorkItemAttachment {
  _id: mongoose.Types.ObjectId;
  name: string;
  /** Compressed JPEG/PNG/etc data-URL. ~700KB cap, same pipeline as bug screenshots. */
  dataUrl: string;
  mime: string;
  bytes: number;
  addedAt: Date;
  addedById: mongoose.Types.ObjectId | null;
  addedByName: string;
}

export interface IWorkItemActivity {
  _id: mongoose.Types.ObjectId;
  at: Date;
  byId: mongoose.Types.ObjectId | null;
  byName: string;
  byHandle: string;
  kind: WorkItemActivityKind;
  text?: string;
  meta?: Record<string, unknown>;
  /** Soft-delete: when set the row is rendered as a tombstone and locked. */
  deletedAt?: Date | null;
  deletedById?: mongoose.Types.ObjectId | null;
  deletedByName?: string | null;
  deletedByHandle?: string | null;
}

export interface IWorkItemSubmission {
  kind: WorkItemSubmissionKind;
  note: string;
  submittedAt: Date;
  submittedById: mongoose.Types.ObjectId;
  submittedByHandle: string;
  submittedByName: string;
}

export interface IWorkItem {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  createdById: mongoose.Types.ObjectId;
  createdByName: string;
  createdByHandle: string;
  /** Assignee is mandatory — someone must own each work item. */
  assignedToId: mongoose.Types.ObjectId;
  assignedToName: string;
  assignedToHandle: string;
  /** Optional link to a BugReport this work item tracks. */
  bugReportId: mongoose.Types.ObjectId | null;
  dueAt: Date | null;
  closedAt: Date | null;
  /** Lowercase tag strings; UI assigns deterministic colors from a palette. */
  tags: string[];
  /** Sortable position within a (status) column. Lower = first. */
  order: number;
  /** Optional effort estimate (Fibonacci-ish, 1/2/3/5/8/13). null = unestimated. */
  storyPoints: number | null;
  /** Checklist sub-tasks rendered inside the detail drawer. */
  subtasks: IWorkItemSubtask[];
  /** Image attachments (data URLs, capped client-side). */
  attachments: IWorkItemAttachment[];
  /** Users who get notified on every comment / status change. Auto-populated
   * from @mentions and explicit follows. */
  watchers: mongoose.Types.ObjectId[];
  /** Write-once outcome from the assignee. Cleared when manager reopens. */
  submission?: IWorkItemSubmission | null;
  /** True after assignee submits anything, until a manager accepts or reopens. */
  needsReview?: boolean;
  /** Conversation log: comments + lifecycle events. */
  activity: IWorkItemActivity[];
  /** Soft-delete: when set, the work item is hidden from queues but kept for audit. */
  deletedAt?: Date | null;
  deletedById?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const WorkItemSubmissionSchema = new Schema<IWorkItemSubmission>(
  {
    kind: { type: String, enum: ["done", "blocked", "wont_do"], required: true },
    note: { type: String, required: true, trim: true, maxlength: 4000 },
    submittedAt: { type: Date, required: true },
    submittedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submittedByHandle: { type: String, required: true },
    submittedByName: { type: String, required: true },
  },
  { _id: false },
);

const WorkItemSubtaskSchema = new Schema<IWorkItemSubtask>(
  {
    text: { type: String, required: true, trim: true, maxlength: 280 },
    done: { type: Boolean, default: false },
    addedAt: { type: Date, required: true, default: () => new Date() },
    addedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    addedByName: { type: String, required: true },
    doneAt: { type: Date, default: null },
    doneById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    doneByName: { type: String, default: null },
  },
  { _id: true, timestamps: false },
);

const WorkItemAttachmentSchema = new Schema<IWorkItemAttachment>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    dataUrl: { type: String, required: true },
    mime: { type: String, default: "image/jpeg" },
    bytes: { type: Number, default: 0 },
    addedAt: { type: Date, required: true, default: () => new Date() },
    addedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    addedByName: { type: String, required: true },
  },
  { _id: true, timestamps: false },
);

const WorkItemActivitySchema = new Schema<IWorkItemActivity>(
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
        "tag_change",
        "subtask_change",
        "attachment_change",
        "points_change",
      ],
      required: true,
    },
    text: { type: String, default: "", maxlength: 4000 },
    meta: { type: Schema.Types.Mixed, default: null },
    deletedAt: { type: Date, default: null },
    deletedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    deletedByName: { type: String, default: null },
    deletedByHandle: { type: String, default: null },
  },
  { _id: true, timestamps: false },
);

const WorkItemSchema = new Schema<IWorkItem>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 5000 },
    status: {
      type: String,
      enum: ["open", "in_progress", "blocked", "done"],
      default: "open",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, required: true },
    createdByHandle: { type: String, required: true },
    assignedToId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedToName: { type: String, required: true },
    assignedToHandle: { type: String, required: true },
    bugReportId: { type: Schema.Types.ObjectId, ref: "BugReport", default: null },
    dueAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    tags: {
      type: [String],
      default: [],
      set: (arr: string[]) =>
        Array.from(
          new Set(
            (arr ?? [])
              .map((t) => String(t ?? "").trim().toLowerCase())
              .filter((t) => t.length > 0 && t.length <= 24),
          ),
        ).slice(0, 12),
    },
    order: { type: Number, default: 0, index: true },
    storyPoints: { type: Number, default: null, min: 0, max: 100 },
    subtasks: { type: [WorkItemSubtaskSchema], default: [] },
    attachments: { type: [WorkItemAttachmentSchema], default: [] },
    watchers: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    submission: { type: WorkItemSubmissionSchema, default: null },
    needsReview: { type: Boolean, default: false, index: true },
    activity: { type: [WorkItemActivitySchema], default: [] },
    deletedAt: { type: Date, default: null, index: true },
    deletedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

WorkItemSchema.index({ createdAt: -1 });
WorkItemSchema.index({ assignedToId: 1, status: 1 });

export const WorkItem =
  (models.WorkItem as mongoose.Model<IWorkItem>) ||
  model<IWorkItem>("WorkItem", WorkItemSchema);
