import mongoose, { Schema, models, model } from "mongoose";
import type { MatchStatus } from "@/lib/constants";

export interface IMatchPlayer {
  name: string;
  role?: string;
  teamShort?: string;
  captain?: boolean;
  keeper?: boolean;
  overseas?: boolean;
}

export interface IMatch {
  _id: mongoose.Types.ObjectId;
  externalId?: string; // sportskeeda slug-based id
  cricbuzzId?: string; // numeric id from cricbuzz live-scores
  cricbuzzSlug?: string; // url slug like "rr-vs-gt-52nd-match-..."
  stage?: "League" | "Qualifier 1" | "Eliminator" | "Qualifier 2" | "Final";
  teamA: string;
  teamB: string;
  teamAShort?: string;
  teamBShort?: string;
  venue?: string;
  startTime: Date;
  status: MatchStatus;
  matchWinner?: string;
  scoreSummary?: string;
  squadA?: string[];
  squadB?: string[];
  players?: IMatchPlayer[]; // full structured roster
  playersFetchedAt?: Date;
  // Special event flags
  doublePoints?: boolean;
  chaosMatch?: boolean;
  noBonus?: boolean;
  predictionMadness?: boolean;
  predictionsLocked: boolean;
  resultsEntered: boolean;
  contestUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MatchSchema = new Schema<IMatch>(
  {
    externalId: { type: String, index: true, unique: true, sparse: true },
    cricbuzzId: { type: String, index: true, sparse: true },
    cricbuzzSlug: { type: String },
    stage: {
      type: String,
      enum: ["League", "Qualifier 1", "Eliminator", "Qualifier 2", "Final"],
      default: "League",
    },
    teamA: { type: String, required: true },
    teamB: { type: String, required: true },
    teamAShort: { type: String },
    teamBShort: { type: String },
    venue: { type: String },
    startTime: { type: Date, required: true, index: true },
    status: { type: String, enum: ["upcoming", "live", "completed"], default: "upcoming", index: true },
    matchWinner: { type: String },
    scoreSummary: { type: String },
    squadA: { type: [String], default: [] },
    squadB: { type: [String], default: [] },
    players: {
      type: [
        new Schema<IMatchPlayer>(
          {
            name: { type: String, required: true },
            role: { type: String },
            teamShort: { type: String },
            captain: { type: Boolean, default: false },
            keeper: { type: Boolean, default: false },
            overseas: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    playersFetchedAt: { type: Date },
    doublePoints: { type: Boolean, default: false },
    chaosMatch: { type: Boolean, default: false },
    noBonus: { type: Boolean, default: false },
    predictionMadness: { type: Boolean, default: false },
    predictionsLocked: { type: Boolean, default: false },
    resultsEntered: { type: Boolean, default: false },
    contestUrl: { type: String },
  },
  { timestamps: true }
);

export const Match = (models.Match as mongoose.Model<IMatch>) || model<IMatch>("Match", MatchSchema);
