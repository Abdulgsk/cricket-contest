import mongoose, { Schema, models, model } from "mongoose";
import type { Role } from "@/lib/constants";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  userId: string; // unique handle (login id)
  username: string; // display name
  password: string; // PLAIN TEXT per spec (do NOT hash)
  whatsapp?: string;
  my11circleName?: string;
  role: Role;
  avatarColor?: string;
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
    avatarColor: { type: String },
    lastSeenRivalryAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = (models.User as mongoose.Model<IUser>) || model<IUser>("User", UserSchema);
