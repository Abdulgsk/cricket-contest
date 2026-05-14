import mongoose, { Schema, models, model } from "mongoose";

export interface IUserMatchTeamPlayer {
  id: number;
  name: string;
  dName: string;
  sName?: string;
  role?: string;
  roleName?: string;
  roleSubType?: string;
  teamId?: number | null;
  teamName?: string;
  imgURL?: string;
  points: number;
  credits?: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isWicketKeeper?: boolean;
  isTopPlayer?: boolean;
  selectedBy?: number | null;
  selCapPerc?: number | null;
  selVcPerc?: number | null;
}

export interface IUserMatchTeam {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  my11MatchId: number;
  my11ContestId: number;
  my11UserTeamId: number;
  my11Username: string;
  userTeamName?: string;
  rank?: number | null;
  score?: number | null;
  captainName?: string;
  viceCaptainName?: string;
  captainIds?: number[];
  viceCaptainIds?: number[];
  players: IUserMatchTeamPlayer[];
  fetchedAt: Date;
  sourceUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PlayerSchema = new Schema<IUserMatchTeamPlayer>(
  {
    id: { type: Number, required: true },
    name: { type: String, required: true },
    dName: { type: String, default: "" },
    sName: { type: String },
    role: { type: String },
    roleName: { type: String },
    roleSubType: { type: String },
    teamId: { type: Number, default: null },
    teamName: { type: String },
    imgURL: { type: String },
    points: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    isCaptain: { type: Boolean, default: false },
    isViceCaptain: { type: Boolean, default: false },
    isWicketKeeper: { type: Boolean, default: false },
    isTopPlayer: { type: Boolean, default: false },
    selectedBy: { type: Number, default: null },
    selCapPerc: { type: Number, default: null },
    selVcPerc: { type: Number, default: null },
  },
  { _id: false }
);

const UserMatchTeamSchema = new Schema<IUserMatchTeam>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    my11MatchId: { type: Number, required: true },
    my11ContestId: { type: Number, required: true },
    my11UserTeamId: { type: Number, required: true },
    my11Username: { type: String, required: true },
    userTeamName: { type: String },
    rank: { type: Number, default: null },
    score: { type: Number, default: null },
    captainName: { type: String },
    viceCaptainName: { type: String },
    captainIds: { type: [Number], default: [] },
    viceCaptainIds: { type: [Number], default: [] },
    players: { type: [PlayerSchema], default: [] },
    fetchedAt: { type: Date, default: () => new Date() },
    sourceUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

UserMatchTeamSchema.index({ matchId: 1, userId: 1 }, { unique: true });

export const UserMatchTeam =
  (models.UserMatchTeam as mongoose.Model<IUserMatchTeam>) ||
  model<IUserMatchTeam>("UserMatchTeam", UserMatchTeamSchema);
