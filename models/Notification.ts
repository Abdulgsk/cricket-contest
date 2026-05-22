import mongoose, { Schema, models, model } from "mongoose";

export type NotificationKind =
  | "match_reminder"
  | "result_published"
  | "rivalry"
  | "bug"
  | "system";

export interface INotification {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId; // null = broadcast (every user sees it)
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  readBy?: mongoose.Types.ObjectId[]; // for broadcasts: which users dismissed it
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    kind: {
      type: String,
      enum: ["match_reminder", "result_published", "rivalry", "bug", "system"],
      default: "system",
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, default: null },
    read: { type: Boolean, default: false },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ createdAt: -1 });

export const Notification =
  (models.Notification as mongoose.Model<INotification>) ||
  model<INotification>("Notification", NotificationSchema);
