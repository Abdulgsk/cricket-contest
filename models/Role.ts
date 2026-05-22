import mongoose, { Schema, models, model } from "mongoose";
import type { FeatureKey } from "@/lib/features";

export interface IRole {
  _id: mongoose.Types.ObjectId;
  name: string; // display name, unique
  /** Legacy array of feature keys. New code reads `permissionBitmap`. */
  features: FeatureKey[];
  /** Feature grants as a BigInt bitmap (decimal string). Source of truth. */
  permissionBitmap?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    features: { type: [String], default: [] },
    permissionBitmap: { type: String, default: "0" },
  },
  { timestamps: true }
);

export const Role = (models.Role as mongoose.Model<IRole>) || model<IRole>("Role", RoleSchema);
