import mongoose, { Schema, models, model } from "mongoose";

export interface INotification {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId; // null = broadcast
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Notification =
  (models.Notification as mongoose.Model<INotification>) ||
  model<INotification>("Notification", NotificationSchema);
