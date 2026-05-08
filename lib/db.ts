import mongoose from "mongoose";
import { requireEnv } from "@/lib/env";

// Reuse the connection across hot-reloads / serverless invocations.
type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalAny = global as unknown as { _mongoose?: Cached };
const cached: Cached = globalAny._mongoose ?? { conn: null, promise: null };
globalAny._mongoose = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(requireEnv("MONGODB_URI"), {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10_000,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
