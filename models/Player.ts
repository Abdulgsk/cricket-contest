import mongoose, { Schema, models, model } from "mongoose";

/**
 * Master player directory built up as a side-effect of fetching my11 user
 * teams. Keyed by my11's numeric `id` so we can:
 *   1. Avoid re-storing per-player metadata in every UserMatchTeam row.
 *   2. Power "who picked this player?" lookups across the friend group.
 *   3. Render a typeahead search of every player the league has ever seen.
 *
 * Per-match team ownership (who picked whom, C/VC flags) still lives in
 * `UserMatchTeam.players[]` — that's the authoritative source for any
 * single team. This collection is the *directory*, not the membership map.
 */
export interface IPlayer {
  _id: mongoose.Types.ObjectId;
  my11Id: number;
  name: string;
  dName: string;
  sName?: string;
  role?: string;
  roleName?: string;
  roleSubType?: string;
  teamId?: number | null;
  teamName?: string;
  imgURL?: string;
  /** First match we ever saw this player in. */
  firstSeenAt: Date;
  /** Most recent match we saw this player in. */
  lastSeenAt: Date;
  /** Latest match id (Mongo) where we observed this player. */
  lastMatchId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const PlayerSchema = new Schema<IPlayer>(
  {
    my11Id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    dName: { type: String, default: "" },
    sName: { type: String },
    role: { type: String },
    roleName: { type: String },
    roleSubType: { type: String },
    teamId: { type: Number, default: null },
    teamName: { type: String },
    imgURL: { type: String },
    firstSeenAt: { type: Date, default: () => new Date() },
    lastSeenAt: { type: Date, default: () => new Date(), index: true },
    lastMatchId: { type: Schema.Types.ObjectId, ref: "Match", default: null },
  },
  { timestamps: true }
);

// Text-ish search fallback (case-insensitive prefix match handled in code; an
// index here gives Mongo a hint for sort-by-name queries).
PlayerSchema.index({ dName: 1 });
PlayerSchema.index({ name: 1 });

export const Player =
  (models.Player as mongoose.Model<IPlayer>) ||
  model<IPlayer>("Player", PlayerSchema);
