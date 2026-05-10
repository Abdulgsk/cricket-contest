import mongoose, { Schema, models, model } from "mongoose";

export interface ISettings {
  _id: mongoose.Types.ObjectId;
  bountyHolderUserId?: mongoose.Types.ObjectId;
  announcement?: string;
  seasonName: string;
  my11sessionCookie?: string;
  my11cookieExpiresAt?: Date;
  updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    bountyHolderUserId: { type: Schema.Types.ObjectId, ref: "User" },
    my11sessionCookie: { type: String, select: false },
    my11cookieExpiresAt: { type: Date },
    announcement: { type: String, default: "" },
    seasonName: { type: String, default: "IPL 2026" },
  },
  { timestamps: true }
);

export const Settings =
  (models.Settings as mongoose.Model<ISettings>) ||
  model<ISettings>("Settings", SettingsSchema);

export async function getSettings() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
}
