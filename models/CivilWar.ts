import mongoose, { Schema, models, model } from "mongoose";

export type CivilWarSide = "A" | "B";

export type CivilWarOutcome =
  | "A_decisive"
  | "B_decisive"
  | "A_split"
  | "B_split"
  | "A_fp_tiebreak"
  | "B_fp_tiebreak"
  | "draw"
  | "not_eligible";

export interface ICivilWarMember {
  userId: mongoose.Types.ObjectId;
  side: CivilWarSide;
  rivalryId: mongoose.Types.ObjectId;
}

export interface ICivilWarResult {
  teamAWinners: number;
  teamBWinners: number;
  teamAFp: number;
  teamBFp: number;
  outcome: CivilWarOutcome;
  teamAPointsPerMember: number;
  teamBPointsPerMember: number;
  captainAUserId?: mongoose.Types.ObjectId | null;
  captainBUserId?: mongoose.Types.ObjectId | null;
  captainAFp?: number;
  captainBFp?: number;
  captainWinnerSide?: "A" | "B" | null;
  captainBonusPerMember?: number;
  leaderTopperUserId?: mongoose.Types.ObjectId | null;
  leaderTopperBonus?: number;
}

export interface ICivilWar {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  teamAName: string;
  teamBName: string;
  members: ICivilWarMember[];
  settled: boolean;
  result?: ICivilWarResult | null;
  createdAt: Date;
  updatedAt: Date;
}

const MemberSchema = new Schema<ICivilWarMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    side: { type: String, enum: ["A", "B"], required: true },
    rivalryId: { type: Schema.Types.ObjectId, ref: "Rivalry", required: true },
  },
  { _id: false }
);

const ResultSchema = new Schema<ICivilWarResult>(
  {
    teamAWinners: { type: Number, default: 0 },
    teamBWinners: { type: Number, default: 0 },
    teamAFp: { type: Number, default: 0 },
    teamBFp: { type: Number, default: 0 },
    outcome: { type: String, required: true },
    teamAPointsPerMember: { type: Number, default: 0 },
    teamBPointsPerMember: { type: Number, default: 0 },
    captainAUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    captainBUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    captainAFp: { type: Number, default: 0 },
    captainBFp: { type: Number, default: 0 },
    captainWinnerSide: { type: String, enum: ["A", "B", null], default: null },
    captainBonusPerMember: { type: Number, default: 0 },
    leaderTopperUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    leaderTopperBonus: { type: Number, default: 0 },
  },
  { _id: false }
);

const CivilWarSchema = new Schema<ICivilWar>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, unique: true, index: true },
    teamAName: { type: String, default: "Team A" },
    teamBName: { type: String, default: "Team B" },
    members: { type: [MemberSchema], default: [] },
    settled: { type: Boolean, default: false, index: true },
    result: { type: ResultSchema, default: null },
  },
  { timestamps: true }
);

export const CivilWar =
  (models.CivilWar as mongoose.Model<ICivilWar>) ||
  model<ICivilWar>("CivilWar", CivilWarSchema);
