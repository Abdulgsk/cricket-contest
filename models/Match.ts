import mongoose, { Schema, models, model } from "mongoose";
import type { MatchStatus } from "@/lib/constants";

export interface IMatchPlayer {
  name: string;
  role?: string;
  teamShort?: string;
  captain?: boolean;
  keeper?: boolean;
  overseas?: boolean;
  profileId?: string;
  imgUrl?: string;
  /** Post-toss XI status: "playing" = in the announced XI, "bench" = impact/bench
   * pool, "" = not yet announced. */
  playingStatus?: "playing" | "bench" | "";
  /** "IN" once this player has come on as the live Impact Player. */
  playingXIChange?: "IN" | "";
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
  predictionTopBatter?: string;
  predictionTopBowler?: string;
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
  predictionLockExtensionMinutes?: number;
  rivalryLockExtensionMinutes?: number;
  predictionLockExtensionAppliedAt?: Date;
  rivalryLockExtensionAppliedAt?: Date;
  bountyUserId?: mongoose.Types.ObjectId;
  bountyReason?: string;
  predictionsLocked: boolean;
  resultsEntered: boolean;
  /** When true, this match feeds the GullyXI Wrapped recap on the dashboard. */
  wrappedEnabled?: boolean;
  contestUrl?: string;
  /** Pre-match reminder thresholds (minutes-before-start) already announced. */
  remindersSent?: number[];
  /** Once true, the contest+team auto-mapper considers this match wired up. */
  autoMapDone?: boolean;
  autoMapAttempts?: number;
  lastAutoMapAt?: Date | null;
  autoMapLastError?: string | null;
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
    predictionTopBatter: { type: String },
    predictionTopBowler: { type: String },
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
            profileId: { type: String },
            imgUrl: { type: String },
            playingStatus: { type: String, enum: ["playing", "bench", ""], default: "" },
            playingXIChange: { type: String, enum: ["IN", ""], default: "" },
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
    predictionLockExtensionMinutes: { type: Number, default: 0, min: 0 },
    rivalryLockExtensionMinutes: { type: Number, default: 0, min: 0 },
    predictionLockExtensionAppliedAt: { type: Date, default: null },
    rivalryLockExtensionAppliedAt: { type: Date, default: null },
    bountyUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    bountyReason: { type: String, trim: true },
    predictionsLocked: { type: Boolean, default: false },
    resultsEntered: { type: Boolean, default: false },
    wrappedEnabled: { type: Boolean, default: false },
    contestUrl: { type: String },
    remindersSent: { type: [Number], default: [] },
    autoMapDone: { type: Boolean, default: false, index: true },
    autoMapAttempts: { type: Number, default: 0 },
    lastAutoMapAt: { type: Date, default: null },
    autoMapLastError: { type: String, default: null },
  },
  { timestamps: true }
);

export const Match = (models.Match as mongoose.Model<IMatch>) || model<IMatch>("Match", MatchSchema);
