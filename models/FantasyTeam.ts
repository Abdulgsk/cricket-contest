import mongoose, { Schema, models, model } from "mongoose";
import type { FantasyRole } from "@/lib/constants";

/**
 * A user's in-app fantasy XI for a single match. Fully independent of my11 —
 * the player pool comes from the Cricbuzz-scraped roster on `Match.players[]`.
 * Per-player live points are filled in by services/fantasy-scoring.ts once the
 * match is underway; the captain/vice-captain multipliers are applied there.
 */
export interface IFantasyTeamPlayer {
  name: string;
  profileId?: string; // Cricbuzz profile id — used to join with scorecard data
  fantasyRole: FantasyRole;
  role?: string; // original Cricbuzz role label
  teamShort?: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
  /** Base fantasy points before C/VC multiplier (filled by scoring engine). */
  basePoints: number;
  /** Points after C/VC multiplier. */
  points: number;
  /** Impact-sub priority (1-4) — only set on entries in `subs[]`. */
  subOrder?: number;
  /** Set during recompute when this starting-XI player was subbed out: the name
   * of the substitute who replaced them (their points stop counting). */
  replacedByName?: string;
  /** Set on a sub when it is activated: the starting-XI player it came in for. */
  activeForName?: string;
}

export interface IFantasyTeam {
  _id: mongoose.Types.ObjectId;
  matchId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  players: IFantasyTeamPlayer[];
  /** Ordered impact substitutes (priority 1-4), not in the starting XI. */
  subs: IFantasyTeamPlayer[];
  captainName: string;
  viceCaptainName: string;
  /** Sum of `points` across the active XI (after multipliers + substitutions). */
  totalPoints: number;
  pointsComputedAt?: Date | null;
  /** Snapshot of the lock deadline this team was saved under. */
  lockedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FantasyTeamPlayerSchema = new Schema<IFantasyTeamPlayer>(
  {
    name: { type: String, required: true },
    profileId: { type: String },
    fantasyRole: { type: String, enum: ["WK", "BAT", "AR", "BOWL"], required: true },
    role: { type: String },
    teamShort: { type: String },
    isCaptain: { type: Boolean, default: false },
    isViceCaptain: { type: Boolean, default: false },
    basePoints: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    subOrder: { type: Number },
    replacedByName: { type: String },
    activeForName: { type: String },
  },
  { _id: false }
);

const FantasyTeamSchema = new Schema<IFantasyTeam>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: "Match", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    players: { type: [FantasyTeamPlayerSchema], default: [] },
    subs: { type: [FantasyTeamPlayerSchema], default: [] },
    captainName: { type: String, default: "" },
    viceCaptainName: { type: String, default: "" },
    totalPoints: { type: Number, default: 0 },
    pointsComputedAt: { type: Date, default: null },
    lockedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// One team per user per match.
FantasyTeamSchema.index({ matchId: 1, userId: 1 }, { unique: true });

export const FantasyTeam =
  (models.FantasyTeam as mongoose.Model<IFantasyTeam>) ||
  model<IFantasyTeam>("FantasyTeam", FantasyTeamSchema);
