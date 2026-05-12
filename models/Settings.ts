import mongoose, { Schema, models, model } from "mongoose";

export interface IBonusConfig {
  consistency: number;
  kingSlayer: number;
  comeback: number;
  underdog: number;
  matchDomination: number;
  bounty: number;
  rivalry: number;
  rivalryRevenge: number;
  maxBonusPerMatch: number;
}

export interface ICustomBonusDefinition {
  id: string;
  name: string;
  points: number;
  basis: string;
  active: boolean;
}

export interface ISettings {
  _id: mongoose.Types.ObjectId;
  bountyHolderUserId?: mongoose.Types.ObjectId;
  announcement?: string;
  seasonName: string;
  bonusConfig?: Partial<IBonusConfig>;
  customBonuses?: ICustomBonusDefinition[];
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
    bonusConfig: {
      consistency: { type: Number },
      kingSlayer: { type: Number },
      comeback: { type: Number },
      underdog: { type: Number },
      matchDomination: { type: Number },
      bounty: { type: Number },
      rivalry: { type: Number },
      rivalryRevenge: { type: Number },
      maxBonusPerMatch: { type: Number },
    },
    customBonuses: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        points: { type: Number, required: true },
        basis: { type: String, required: true },
        active: { type: Boolean, default: true },
      },
    ],
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
