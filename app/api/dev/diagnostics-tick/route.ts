import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireUser, userHasFeature } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { Match } from "@/models/Match";
import { Prediction } from "@/models/Prediction";
import { Rivalry } from "@/models/Rivalry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cache last CPU snapshot per warm lambda so the percentage is a delta between
// successive polls (otherwise process.cpuUsage() returns since-process-start,
// which is meaningless after a long uptime).
const g = global as unknown as {
  _diagTick?: { time: number; cpu: NodeJS.CpuUsage };
  _reqStamps?: number[];
};

export async function GET() {
  const me = await requireUser();
  if (!userHasFeature(me, "dev.diagnostics.view") && me.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const mem = process.memoryUsage();
  const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

  const nowMs = Date.now();
  const nowCpu = process.cpuUsage();
  let cpuPct = 0;
  if (g._diagTick) {
    const elapsedMicros = (nowMs - g._diagTick.time) * 1000;
    const usedMicros =
      nowCpu.user - g._diagTick.cpu.user + (nowCpu.system - g._diagTick.cpu.system);
    if (elapsedMicros > 0) {
      cpuPct = Math.max(0, Math.min(100, (usedMicros / elapsedMicros) * 100));
    }
  }
  g._diagTick = { time: nowMs, cpu: nowCpu };

  // Trim & count requests in the last 60s (sliding window populated by proxy.ts).
  const stamps = (g._reqStamps ??= []);
  while (stamps.length && stamps[0] < nowMs - 60_000) stamps.shift();
  const requestsPerMin = stamps.length;

  await connectDB();
  const sixtyAgo = new Date(nowMs - 60_000);
  const fiveMinAgo = new Date(nowMs - 5 * 60_000);

  const [onlineDocs, activeUserCount, userCount, matchCount, predictionCount, rivalryCount] =
    await Promise.all([
      User.find({ lastSeenAt: { $gte: sixtyAgo } })
        .select({ userId: 1, username: 1, avatar: 1, avatarColor: 1, lastSeenAt: 1 })
        .sort({ lastSeenAt: -1 })
        .limit(50)
        .lean(),
      User.countDocuments({ lastSeenAt: { $gte: fiveMinAgo } }),
      User.estimatedDocumentCount(),
      Match.estimatedDocumentCount(),
      Prediction.estimatedDocumentCount(),
      Rivalry.estimatedDocumentCount(),
    ]);

  const onlineUsers = onlineDocs.map((u) => ({
    userId: u.userId,
    username: u.username,
    avatar: u.avatar ?? null,
    lastSeenAt: u.lastSeenAt ?? null,
  }));

  return NextResponse.json({
    t: nowMs,
    uptimeSec: Math.round(process.uptime()),
    cpuPct: Math.round(cpuPct * 10) / 10,
    memory: {
      rssMb: mb(mem.rss),
      heapUsedMb: mb(mem.heapUsed),
      heapTotalMb: mb(mem.heapTotal),
      externalMb: mb(mem.external),
    },
    mongo: {
      state: mongoose.connection.readyState,
    },
    requestsPerMin,
    concurrentUsers: onlineUsers.length,
    activeUsers5m: activeUserCount,
    onlineUsers,
    counts: {
      users: userCount,
      matches: matchCount,
      predictions: predictionCount,
      rivalries: rivalryCount,
    },
  });
}
