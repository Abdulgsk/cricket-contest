import mongoose, { Schema, models, model } from "mongoose";
import type { Role } from "@/lib/constants";
import type { FeatureKey } from "@/lib/features";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  userId: string; // unique handle (login id)
  username: string; // display name
  password: string; // PLAIN TEXT per spec (do NOT hash)
  whatsapp?: string;
  my11circleName?: string;
  role: Role;
  /** Legacy array of feature keys. Kept for back-compat; new code reads `permissionBitmap`. */
  enabledFeatures?: FeatureKey[];
  /** Direct feature grants as a BigInt bitmap (decimal string). Source of truth. */
  permissionBitmap?: string;
  /** Reference to a custom Role; when set, its features are merged into the user's effective feature set. */
  customRoleId?: mongoose.Types.ObjectId | null;
  avatarColor?: string;
  /**
   * Profile picture stored as a compressed data URI ("data:image/jpeg;base64,...").
   * Capped server-side at ~96 KB; clients resize to <=256x256 JPEG before upload.
   */
  avatar?: string | null;
  /** Short user bio shown on profile / player page. */
  bio?: string | null;
  lastSeenRivalryAt?: Date;
  /** Updated (throttled to ~30s) whenever a logged-in user touches a server
   * route. Used to compute concurrent/active user counts and “online now”
   * indicators. Never trust this for security — it’s a UX signal. */
  lastSeenAt?: Date | null;
  /** Pending or recently-decided request to change my11circleName. While
   * `status === "approved"` and within the verify window the user can run
   * the verification + save flow once. */
  my11NameRequest?: {
    requested: string;
    requestedAt: Date;
    status: "pending" | "approved" | "denied";
    decidedAt?: Date | null;
    deniedReason?: string | null;
  } | null;
  /** While `now < my11NameChangeGraceUntil` the user may run verify+save
   * directly without admin approval. Set after each successful verified save. */
  my11NameChangeGraceUntil?: Date | null;
  /** Per-user UI preferences. Currently used by the work-items panel for
   * persisting view mode, saved filters and the default landing view. */
  preferences?: {
    workItems?: {
      view?: "list" | "board" | "table" | "calendar" | "mine";
      defaultFilters?: Record<string, unknown> | null;
      savedViews?: Array<{
        id: string;
        name: string;
        view: "list" | "board" | "table" | "calendar" | "mine";
        filters: Record<string, unknown>;
      }>;
    } | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    userId: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    username: { type: String, required: true, trim: true },
    password: { type: String, required: true }, // intentionally plaintext
    whatsapp: { type: String, trim: true },
    my11circleName: { type: String, trim: true },
    role: { type: String, enum: ["user", "admin", "superadmin"], default: "user", index: true },
    enabledFeatures: { type: [String], default: [] },
    permissionBitmap: { type: String, default: "0" },
    customRoleId: { type: Schema.Types.ObjectId, ref: "Role", default: null, index: true },
    avatarColor: { type: String },
    avatar: { type: String, default: null },
    bio: { type: String, default: null, maxlength: 280 },
    lastSeenRivalryAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null, index: true },
    my11NameRequest: {
      type: new Schema(
        {
          requested: { type: String, required: true, trim: true },
          requestedAt: { type: Date, required: true },
          status: {
            type: String,
            enum: ["pending", "approved", "denied"],
            required: true,
          },
          decidedAt: { type: Date, default: null },
          deniedReason: { type: String, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    my11NameChangeGraceUntil: { type: Date, default: null },
    preferences: {
      type: new Schema(
        {
          workItems: {
            type: new Schema(
              {
                view: {
                  type: String,
                  enum: ["list", "board", "table", "calendar", "mine"],
                  default: "list",
                },
                defaultFilters: { type: Schema.Types.Mixed, default: null },
                savedViews: {
                  type: [
                    new Schema(
                      {
                        id: { type: String, required: true },
                        name: { type: String, required: true, maxlength: 60 },
                        view: {
                          type: String,
                          enum: ["list", "board", "table", "calendar", "mine"],
                          required: true,
                        },
                        filters: { type: Schema.Types.Mixed, default: {} },
                      },
                      { _id: false },
                    ),
                  ],
                  default: [],
                },
              },
              { _id: false },
            ),
            default: null,
          },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true }
);

export const User = (models.User as mongoose.Model<IUser>) || model<IUser>("User", UserSchema);
