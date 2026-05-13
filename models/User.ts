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
  enabledFeatures?: FeatureKey[];
  avatarColor?: string;
  /**
   * Profile picture stored as a compressed data URI ("data:image/jpeg;base64,...").
   * Capped server-side at ~96 KB; clients resize to <=256x256 JPEG before upload.
   */
  avatar?: string | null;
  /** Short user bio shown on profile / player page. */
  bio?: string | null;
  lastSeenRivalryAt?: Date;
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
    avatarColor: { type: String },
    avatar: { type: String, default: null },
    bio: { type: String, default: null, maxlength: 280 },
    lastSeenRivalryAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = (models.User as mongoose.Model<IUser>) || model<IUser>("User", UserSchema);
