// Pre-match reminder cron. Vercel cron hits this every few minutes. It scans
// upcoming matches whose start time is within ~32 minutes, and for each of the
// 30/20/10-minute thresholds it hasn't announced yet, creates ONE broadcast
// notification with an AI-written sentence.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { Notification } from "@/models/Notification";
import { env } from "@/lib/env";
import { generateNotificationLine } from "@/services/notification-ai";

export const dynamic = "force-dynamic";

const THRESHOLDS = [30, 20, 10] as const;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await connectDB();

  const now = Date.now();
  const upcoming = await Match.find({
    status: "upcoming",
    startTime: {
      $gte: new Date(now - 60_000), // tiny grace for clock skew
      $lte: new Date(now + 35 * 60_000),
    },
  }).limit(20);

  const fired: { matchId: string; minute: number }[] = [];

  for (const m of upcoming) {
    const minsLeft = Math.round((m.startTime.getTime() - now) / 60_000);
    // Pick the LARGEST threshold that hasn't fired yet AND has already arrived
    // (current time within ±2 min of that threshold's window). We allow firing
    // any past unfired threshold so a cron miss doesn't drop the reminder.
    const alreadySent = new Set(m.remindersSent ?? []);
    const pending = THRESHOLDS.filter((t) => !alreadySent.has(t) && minsLeft <= t + 0.5).sort(
      (a, b) => b - a, // largest first; if both 30 & 20 pending we send one notif per run
    );
    if (pending.length === 0) continue;

    // Only fire ONE per run per match to avoid spamming on backfill.
    const threshold = pending[0];

    const body = await generateNotificationLine(
      {
        occasion: `${threshold}-minute pre-match reminder`,
        facts: {
          teams: `${m.teamA} vs ${m.teamB}`,
          minutes_until_start: threshold,
          venue: m.venue ?? null,
        },
      },
      `${m.teamA} vs ${m.teamB} starts in ~${threshold} minutes — lock your team and predictions.`,
    );

    await Notification.create({
      userId: undefined,
      kind: "match_reminder",
      title: `${threshold} min: ${m.teamA} vs ${m.teamB}`,
      body,
      link: `/matches/${String(m._id)}`,
    });

    m.remindersSent = [...(m.remindersSent ?? []), threshold];
    await m.save();
    fired.push({ matchId: String(m._id), minute: threshold });
  }

  return NextResponse.json({
    ok: true,
    scanned: upcoming.length,
    fired,
    ranAt: new Date().toISOString(),
  });
}
