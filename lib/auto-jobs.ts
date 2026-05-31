// Self-triggering background jobs replacing Vercel cron.
//
// Called fire-and-forget from app/(app)/layout.tsx on every protected page
// load. Cheap to call: a Settings read + one Match countDocuments before any
// real work happens. Throttle state lives in MongoDB so it survives lambda
// restarts and is shared across concurrent regions.
//
//   - IPL fixtures sync: runs at most 3 times per UTC day (slots 02:00,
//     10:00, 18:00). Each slot fires once on the first qualifying request.
//   - Match reminders: scans upcoming matches whose start time is within
//     ~32 minutes and fires unsent 30/20/10-minute notifications.
//
// If there's no traffic during a slot, the sync simply skips — admins have a
// manual button on the Operations panel. Reminders ride on the existing
// `Match.remindersSent` idempotency guard, so opportunistic firing is safe.

import { connectDB } from "@/lib/db";
import { Settings, invalidateSettingsCache } from "@/models/Settings";
import { Match } from "@/models/Match";
import { Notification } from "@/models/Notification";
import { syncIplMatches } from "@/services/ipl-sync";
import { generateNotificationLine } from "@/services/notification-ai";

// Three sync slots per UTC day (hour-of-day).
const SYNC_SLOT_HOURS = [2, 10, 18] as const;

// In-process locks to avoid one warm lambda running the same job twice
// concurrently while the DB write is in flight.
let syncRunning = false;
let remindersRunning = false;

/** Returns "YYYY-MM-DD-slotN" for the most recently elapsed slot, or null
 * if no slot has elapsed yet today. */
function currentSyncSlotKey(now: Date): string | null {
  const utcHour = now.getUTCHours();
  let slotIdx = -1;
  for (let i = 0; i < SYNC_SLOT_HOURS.length; i++) {
    if (utcHour >= SYNC_SLOT_HOURS[i]) slotIdx = i;
  }
  if (slotIdx < 0) return null;
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}-slot${slotIdx}`;
}

async function runIplSyncIfDue(): Promise<void> {
  if (syncRunning) return;
  const now = new Date();
  const slotKey = currentSyncSlotKey(now);
  if (!slotKey) return;

  await connectDB();
  // Atomic claim: only update if the slot hasn't been recorded yet. The
  // returned doc is the doc BEFORE the update — if its slot already matched,
  // findOneAndUpdate matched nothing and returns null.
  const claim = await Settings.findOneAndUpdate(
    { lastAutoSyncSlot: { $ne: slotKey } },
    { $set: { lastAutoSyncSlot: slotKey } },
    { returnDocument: "before" },
  );
  if (!claim) return; // another request already claimed this slot

  syncRunning = true;
  try {
    invalidateSettingsCache();
    await syncIplMatches();
  } catch (err) {
    console.warn("[auto-jobs] ipl sync failed", err);
    // Roll back the claim so the next request retries this slot.
    await Settings.updateOne(
      { lastAutoSyncSlot: slotKey },
      { $unset: { lastAutoSyncSlot: "" } },
    );
    invalidateSettingsCache();
  } finally {
    syncRunning = false;
  }
}

const REMINDER_THRESHOLDS = [30, 20, 10] as const;

async function runMatchRemindersIfDue(): Promise<void> {
  if (remindersRunning) return;
  await connectDB();
  const now = Date.now();

  const upcoming = await Match.find({
    status: "upcoming",
    startTime: {
      $gte: new Date(now - 60_000),
      $lte: new Date(now + 35 * 60_000),
    },
  }).limit(20);
  if (upcoming.length === 0) return;

  remindersRunning = true;
  try {
    for (const m of upcoming) {
      const minsLeft = Math.round((m.startTime.getTime() - now) / 60_000);
      const alreadySent = new Set(m.remindersSent ?? []);
      const pending = REMINDER_THRESHOLDS.filter(
        (t) => !alreadySent.has(t) && minsLeft <= t + 0.5,
      ).sort((a, b) => b - a);
      if (pending.length === 0) continue;

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
    }
  } catch (err) {
    console.warn("[auto-jobs] reminder scan failed", err);
  } finally {
    remindersRunning = false;
  }
}

/** Fire-and-forget. Safe to call on every page render — both jobs are
 * cheaply gated and idempotent. */
export function kickAutoJobs(): void {
  void runIplSyncIfDue();
  void runMatchRemindersIfDue();
}
