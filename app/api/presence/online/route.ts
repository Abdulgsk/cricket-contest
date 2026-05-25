import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Returns the set of currently-online users (active in the last 60 seconds).
 * Auth-gated to any logged-in member. Used by the global PresenceProvider so
 * UserAvatar instances across the app can render a green "online" dot.
 */
export async function GET() {
  await requireUser();
  await connectDB();

  const sixtyAgo = new Date(Date.now() - 60_000);
  const users = await User.find({ lastSeenAt: { $gte: sixtyAgo } })
    .select({ userId: 1, username: 1 })
    .lean();

  return NextResponse.json({
    t: Date.now(),
    online: users.map((u) => ({
      userId: String(u.userId ?? ""),
      username: String(u.username ?? ""),
    })),
  });
}
