import mongoose, { Schema, models, model } from "mongoose";

export interface IBonusConfig {
  consistency: number;
  kingSlayer: number;
  comeback: number;
  underdog: number;
  matchDomination: number;
  topperDefendsTop: number;
  topperTopsMatch: number;
  captainTeamWin: number;
  leaderTopperBonus: number;
  bounty: number;
  rivalry: number;
  rivalryRevenge: number;
  maxBonusPerMatch: number;
}

export interface ICivilWarConfig {
  decisiveWin: number;
  decisiveLoss: number;
  splitWin: number;
  splitLoss: number;
}

export interface ICustomBonusDefinition {
  id: string;
  name: string;
  points: number;
  basis: string;
  action: "add" | "deduct";
  conditionLogic: "all" | "any";
  conditions: Array<{
    conditionType:
      | "fantasy_points_gte"
      | "fantasy_points_lte"
      | "rank_lte"
      | "rank_gte"
      | "leaderboard_climb_gte"
      | "leaderboard_drop_gte"
      | "pre_match_table_pos_lte"
      | "pre_match_table_pos_gte"
      | "post_match_table_pos_lte"
      | "post_match_table_pos_gte"
      | "beat_pre_match_leader_fp"
      | "top_n_by_fantasy_points"
      | "bottom_n_by_fantasy_points"
      | "missed_match"
      | "played_match";
    conditionValue?: number;
  }>;
  active: boolean;
}

export interface ISettings {
  _id: mongoose.Types.ObjectId;
  bountyHolderUserId?: mongoose.Types.ObjectId;
  announcement?: string;
  seasonName: string;
  bonusConfig?: Partial<IBonusConfig>;
  customBonuses?: ICustomBonusDefinition[];
  civilWarConfig?: Partial<ICivilWarConfig>;
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
      topperDefendsTop: { type: Number },
      topperTopsMatch: { type: Number },
      captainTeamWin: { type: Number },
      leaderTopperBonus: { type: Number },
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
        action: { type: String, enum: ["add", "deduct"], default: "add" },
        conditionLogic: { type: String, enum: ["all", "any"], default: "all" },
        conditions: [
          {
            conditionType: { type: String, required: true },
            conditionValue: { type: Number },
          },
        ],
        active: { type: Boolean, default: true },
      },
    ],
    civilWarConfig: {
      decisiveWin: { type: Number },
      decisiveLoss: { type: Number },
      splitWin: { type: Number },
      splitLoss: { type: Number },
    },
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
