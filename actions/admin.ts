"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { Settings, getSettings } from "@/models/Settings";
import { AuditLog } from "@/models/AuditLog";
import { Prediction } from "@/models/Prediction";
import { MatchResult } from "@/models/MatchResult";
import { Rivalry } from "@/models/Rivalry";
import { Notification } from "@/models/Notification";
import { CustomPool } from "@/models/CustomPool";
import { CustomPoolPrediction } from "@/models/CustomPoolPrediction";
import { BonusAuditLog } from "@/models/BonusAuditLog";
import { PredictionAuditLog } from "@/models/PredictionAuditLog";
import { DailyFact } from "@/models/DailyFact";
import { processMatchResults } from "@/services/scoring";
import { adminResetPrediction } from "@/services/prediction-engine";
import { syncIplMatches, refreshSquads, refreshMatchPlayers } from "@/services/ipl-sync";
import { scoreCustomPools } from "@/actions/custom-pools";
import { requireAdminFeature, requireRole } from "@/lib/rbac";
import { env } from "@/lib/env";
import { normalizeMy11circleName } from "@/lib/my11circle";
import { fetchLeaderboardFromContestUrl } from "@/lib/my11-api";
import { BONUSES } from "@/lib/constants";
import { FEATURE_KEYS } from "@/lib/features";

const MatchSchema = z.object({
  teamA: z.string().min(1),
  teamB: z.string().min(1),
  venue: z.string().optional().or(z.literal("")),
  startTime: z.string().min(1),
  doublePoints: z.boolean().optional(),
  chaosMatch: z.boolean().optional(),
  noBonus: z.boolean().optional(),
  predictionMadness: z.boolean().optional(),
});

export async function createMatchAction(formData: FormData) {
  const me = await requireAdminFeature("matches.manage");
  const parsed = MatchSchema.safeParse({
    teamA: formData.get("teamA"),
    teamB: formData.get("teamB"),
    venue: formData.get("venue") ?? "",
    startTime: formData.get("startTime"),
    doublePoints: formData.get("doublePoints") === "on",
    chaosMatch: formData.get("chaosMatch") === "on",
    noBonus: formData.get("noBonus") === "on",
    predictionMadness: formData.get("predictionMadness") === "on",
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await connectDB();
  const m = await Match.create({
    ...parsed.data,
    venue: parsed.data.venue || undefined,
    startTime: new Date(parsed.data.startTime),
  });
  await AuditLog.create({ actorId: me._id, action: "match.create", meta: { matchId: m._id } });
  revalidatePath("/admin/matches");
  revalidatePath("/matches");
  return { ok: true, id: String(m._id) };
}

export async function deleteMatchAction(matchId: string) {
  const me = await requireAdminFeature("matches.manage");
  await connectDB();
  await Match.deleteOne({ _id: matchId });
  await AuditLog.create({ actorId: me._id, action: "match.delete", meta: { matchId } });
  revalidatePath("/admin/matches");
}

export async function lockMatchAction(matchId: string) {
  await requireAdminFeature("matches.manage");
  await connectDB();
  await Match.updateOne({ _id: matchId }, { predictionsLocked: true, status: "live" });
  revalidatePath(`/matches/${matchId}`);
}

const ContestUrlSchema = z.object({
  matchId: z.string().min(1),
  contestUrl: z.string().url().or(z.literal("")),
});

export async function updateContestUrlAction(payload: unknown) {
  const me = await requireAdminFeature("matches.manage");
  const parsed = ContestUrlSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Please enter a valid URL" };
  await connectDB();
  const { matchId, contestUrl } = parsed.data;
  await Match.updateOne(
    { _id: matchId },
    contestUrl ? { contestUrl } : { $unset: { contestUrl: 1 } }
  );
  await AuditLog.create({
    actorId: me._id,
    action: "match.contestUrl",
    meta: { matchId, contestUrl },
  });
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/admin/matches/${matchId}/result`);
  revalidatePath("/predictions");
  return { ok: true as const };
}

const MatchModesSchema = z.object({
  matchId: z.string().min(1),
  doublePoints: z.boolean(),
  chaosMatch: z.boolean(),
  noBonus: z.boolean(),
  predictionMadness: z.boolean(),
});

export async function updateMatchModesAction(payload: unknown) {
  const me = await requireAdminFeature("matches.manage");
  const parsed = MatchModesSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid payload" };
  await connectDB();
  const { matchId, ...modes } = parsed.data;
  await Match.updateOne({ _id: matchId }, modes);
  await AuditLog.create({
    actorId: me._id,
    action: "match.modes",
    meta: { matchId, ...modes },
  });
  revalidatePath(`/admin/matches/${matchId}/result`);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/admin/matches");
  revalidatePath("/matches");
  return { ok: true };
}

const MatchLockExtensionsSchema = z.object({
  matchId: z.string().min(1),
  predictionLockExtensionMinutes: z.number().int().min(0).max(1440),
  rivalryLockExtensionMinutes: z.number().int().min(0).max(1440),
});

export async function updateMatchLockExtensionsAction(payload: unknown) {
  const me = await requireAdminFeature("match.lock.extend");
  const parsed = MatchLockExtensionsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();
  const { matchId, predictionLockExtensionMinutes, rivalryLockExtensionMinutes } = parsed.data;

  const now = new Date();
  // Saving always re-stamps appliedAt so the deadline becomes `now + minutes`
  // (or `startTime + minutes` if the match hasn't started yet). This makes
  // "Save" behave like "Re-open this module right now for everyone".
  await Match.updateOne(
    { _id: matchId },
    {
      predictionLockExtensionMinutes,
      rivalryLockExtensionMinutes,
      predictionLockExtensionAppliedAt: now,
      rivalryLockExtensionAppliedAt: now,
      predictionsLocked: false,
    }
  );
  await AuditLog.create({
    actorId: me._id,
    action: "match.lockExtensions",
    meta: { matchId, predictionLockExtensionMinutes, rivalryLockExtensionMinutes },
  });
  revalidatePath(`/admin/matches/${matchId}/result`);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/rivalry");
  revalidatePath("/predictions");
  return { ok: true as const };
}

const ResultSchema = z.object({
  matchId: z.string().min(1),
  predictionWinner: z.string().min(1),
  predictionTopBatter: z.string().min(1),
  predictionTopBowler: z.string().min(1),
  scoreSummary: z.string().max(200).optional(),
  customPoolResults: z
    .array(z.object({ poolId: z.string().min(1), correctOption: z.string().min(1) }))
    .optional(),
  entries: z
    .array(
      z.object({
        userId: z.string().min(1),
        rank: z.number().int().min(0).max(13),
        fantasyPoints: z.number(),
      })
    )
    .min(1),
});

export async function submitResultsAction(payload: unknown) {
  const me = await requireAdminFeature("results.manage");
  const parsed = ResultSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid payload" };
  await processMatchResults(
    parsed.data.matchId,
    parsed.data.entries,
    {
      winner: parsed.data.predictionWinner,
      topBatter: parsed.data.predictionTopBatter,
      topBowler: parsed.data.predictionTopBowler,
    },
    { scoreSummary: parsed.data.scoreSummary }
  );
  if (parsed.data.customPoolResults?.length) {
    await scoreCustomPools(parsed.data.matchId, parsed.data.customPoolResults);
  }
  await AuditLog.create({
    actorId: me._id,
    action: "match.results",
    meta: { matchId: parsed.data.matchId },
  });
  revalidatePath("/leaderboard");
  revalidatePath(`/matches/${parsed.data.matchId}`);
  return { ok: true };
}

export async function setRoleAction(targetUserId: string, role: "user" | "admin" | "superadmin") {
  const me = await requireRole("superadmin");
  await connectDB();
  await User.updateOne({ _id: targetUserId }, { role });
  await AuditLog.create({ actorId: me._id, action: "user.role", meta: { targetUserId, role } });
  revalidatePath("/admin/users");
}

export async function deleteUserCascadeAction(targetUserId: string, confirmText: string) {
  const me = await requireRole("superadmin");
  if (confirmText !== "DELETE") {
    return { ok: false as const, error: "Confirmation text must be exactly 'DELETE'" };
  }
  if (String(targetUserId) === String(me._id)) {
    return { ok: false as const, error: "You cannot delete your own account" };
  }
  await connectDB();
  const target = await User.findById(targetUserId).lean();
  if (!target) return { ok: false as const, error: "User not found" };

  const uid = target._id;
  const summary = {
    predictions: 0,
    matchResults: 0,
    rivalries: 0,
    notifications: 0,
    customPools: 0,
    customPoolPredictions: 0,
    bonusAuditLogs: 0,
    predictionAuditLogs: 0,
    dailyFacts: 0,
  };

  // Delete user's own data
  summary.predictions = (await Prediction.deleteMany({ userId: uid })).deletedCount ?? 0;
  summary.matchResults = (await MatchResult.deleteMany({ userId: uid })).deletedCount ?? 0;
  summary.notifications = (await Notification.deleteMany({ userId: uid })).deletedCount ?? 0;
  summary.customPoolPredictions = (await CustomPoolPrediction.deleteMany({ userId: uid })).deletedCount ?? 0;
  summary.bonusAuditLogs = (await BonusAuditLog.deleteMany({ userId: uid })).deletedCount ?? 0;
  summary.predictionAuditLogs = (await PredictionAuditLog.deleteMany({ userId: uid })).deletedCount ?? 0;
  summary.dailyFacts = (await DailyFact.deleteMany({ userId: uid })).deletedCount ?? 0;

  // Rivalries this user is part of (either side)
  summary.rivalries = (await Rivalry.deleteMany({
    $or: [{ challengerId: uid }, { opponentId: uid }],
  })).deletedCount ?? 0;

  // Custom pools created by this user (also remove their predictions)
  const ownedPools = await CustomPool.find({ createdBy: uid }).select("_id").lean();
  if (ownedPools.length) {
    const poolIds = ownedPools.map((p) => p._id);
    await CustomPoolPrediction.deleteMany({ poolId: { $in: poolIds } });
    summary.customPools = (await CustomPool.deleteMany({ _id: { $in: poolIds } })).deletedCount ?? 0;
  }

  // Clear references on Match (bountyUserId) and Settings (bountyHolderUserId)
  await Match.updateMany({ bountyUserId: uid }, { $unset: { bountyUserId: 1, bountyReason: 1 } });
  const settings = await getSettings();
  if (settings.bountyHolderUserId && String(settings.bountyHolderUserId) === String(uid)) {
    settings.bountyHolderUserId = undefined;
    await settings.save();
  }

  // Finally delete the user
  await User.deleteOne({ _id: uid });

  await AuditLog.create({
    actorId: me._id,
    action: "user.delete.cascade",
    meta: {
      targetUserId: String(uid),
      targetUsername: target.username,
      targetHandle: target.userId,
      summary,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { ok: true as const, summary };
}

export async function resetPredictionAction(matchId: string, userId: string) {
  const me = await requireAdminFeature("results.manage");
  await adminResetPrediction({ adminId: String(me._id), matchId, userId });
  revalidatePath(`/matches/${matchId}`);
}

const MatchBountySchema = z.object({
  matchId: z.string().min(1),
  bountyUserId: z.string().min(1).nullable(),
  bountyReason: z.string().max(200).optional().or(z.literal("")),
});

export async function updateMatchBountyAction(payload: unknown) {
  const me = await requireAdminFeature("bonus.manage");
  const parsed = MatchBountySchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };
  await connectDB();
  const { matchId, bountyUserId, bountyReason } = parsed.data;
  if (bountyUserId) {
    const reason = bountyReason?.trim() ?? "";
    if (reason) {
      await Match.updateOne({ _id: matchId }, { $set: { bountyUserId, bountyReason: reason } });
    } else {
      await Match.updateOne({ _id: matchId }, { $set: { bountyUserId }, $unset: { bountyReason: 1 } });
    }
  } else {
    await Match.updateOne({ _id: matchId }, { $unset: { bountyUserId: 1, bountyReason: 1 } });
  }
  await AuditLog.create({
    actorId: me._id,
    action: "match.bounty",
    meta: { matchId, bountyUserId, bountyReason },
  });
  revalidatePath(`/admin/matches/${matchId}/result`);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function setBountyAction(userId: string | null) {
  const me = await requireAdminFeature("bonus.manage");
  await connectDB();
  const s = await getSettings();
  s.bountyHolderUserId = userId ? (userId as unknown as typeof s.bountyHolderUserId) : undefined;
  await s.save();
  await AuditLog.create({ actorId: me._id, action: "bounty.set", meta: { userId } });
  revalidatePath("/leaderboard");
}

export async function setAnnouncementAction(text: string) {
  await requireRole("admin", "superadmin");
  await connectDB();
  await Settings.updateOne({}, { announcement: text }, { upsert: true });
  revalidatePath("/");
  revalidatePath("/dashboard");
}

const BonusSettingsSchema = z.object({
  bonusConfig: z.object({
    consistency: z.number().int().min(0).max(50),
    kingSlayer: z.number().int().min(0).max(50),
    comeback: z.number().int().min(0).max(50),
    underdog: z.number().int().min(0).max(50),
    matchDomination: z.number().int().min(0).max(50),
    bounty: z.number().int().min(0).max(50),
    rivalry: z.number().int().min(0).max(50),
    rivalryRevenge: z.number().int().min(0).max(50),
  }),
  customBonuses: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(80),
      points: z.number().int().min(0).max(200),
      basis: z.string().min(1).max(240),
      conditionType: z.enum([
        "fantasy_points_gte",
        "rank_lte",
        "leaderboard_climb_gte",
        "beat_pre_match_leader_fp",
        "top_n_by_fantasy_points",
      ]),
      conditionValue: z.number().int().min(0).max(10000).optional(),
      active: z.boolean(),
    })
  ),
});

export async function updateBonusSettingsAction(payload: unknown) {
  const me = await requireAdminFeature("bonus.manage");
  const parsed = BonusSettingsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid bonus settings" };
  await connectDB();

  const defaults = {
    consistency: BONUSES.CONSISTENCY,
    kingSlayer: BONUSES.KING_SLAYER,
    comeback: BONUSES.COMEBACK,
    underdog: BONUSES.UNDERDOG,
    matchDomination: BONUSES.MATCH_DOMINATION,
    bounty: BONUSES.BOUNTY,
    rivalry: BONUSES.RIVALRY,
    rivalryRevenge: 1,
  };

  const bonusConfig = { ...defaults, ...parsed.data.bonusConfig };

  await Settings.updateOne(
    {},
    {
      $set: {
        bonusConfig,
        customBonuses: parsed.data.customBonuses,
      },
    },
    { upsert: true }
  );

  await AuditLog.create({
    actorId: me._id,
    action: "settings.bonuses",
    meta: {
      bonusConfig,
      customBonusCount: parsed.data.customBonuses.length,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/rules");
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

const UserFeaturesSchema = z.object({
  targetUserId: z.string().min(1),
  features: z.array(z.enum(FEATURE_KEYS)).default([]),
});

export async function setUserFeaturesAction(payload: unknown) {
  const me = await requireRole("superadmin");
  const parsed = UserFeaturesSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid payload" };

  const { targetUserId, features } = parsed.data;
  await connectDB();
  await User.updateOne({ _id: targetUserId }, { $set: { enabledFeatures: features } });
  await AuditLog.create({
    actorId: me._id,
    action: "user.features",
    meta: { targetUserId, features },
  });
  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function checkMy11SessionAction() {
  await requireRole("admin", "superadmin");
  try {
    const { checkLogin, getSessionCookieMeta } = await import("@/lib/my11-api");
    const meta = await getSessionCookieMeta();
    if (!meta.hasCookie) {
      return { ok: true as const, hasCookie: false, loggedIn: false, expiresAt: null };
    }
    const probe = await checkLogin();
    return {
      ok: true as const,
      hasCookie: true,
      loggedIn: probe.loggedIn,
      expiresAt: meta.expiresAt,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function listMy11MatchesAction() {
  await requireRole("admin", "superadmin");
  try {
    const { listAllMatches } = await import("@/lib/my11-api");
    const matches = await listAllMatches();
    return {
      ok: true as const,
      matches: matches.map((m) => ({
        matchId: m.matchId,
        team1: m.team1,
        team1Short: m.team1Short,
        team2: m.team2,
        team2Short: m.team2Short,
        displayName: m.displayName,
        startTime: m.startTime,
        status: m.status,
        statusLabel: m.statusLabel,
        isJoined: m.isJoined,
        seriesName: m.seriesName,
      })),
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function listMy11ContestsAction(my11MatchId: number) {
  await requireRole("admin", "superadmin");
  try {
    const { listMyContests } = await import("@/lib/my11-api");
    const contests = await listMyContests(my11MatchId);
    return {
      ok: true as const,
      contests: contests.map((c) => ({
        contestId: c.contestId,
        contestName: c.contestName,
        prizePool: c.prizePool,
        totalTeams: c.totalTeams,
        joinedTeams: c.joinedTeams,
      })),
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function setMatchContestUrlAction(matchId: string, contestUrl: string) {
  await requireRole("admin", "superadmin");
  await connectDB();
  await Match.updateOne({ _id: matchId }, { $set: { contestUrl } });
  revalidatePath(`/admin/matches/${matchId}/result`);
  return { ok: true as const };
}

// ---- IPL auto-import ----

export async function syncIplMatchesAction() {
  const me = await requireRole("admin", "superadmin");
  try {
    const r = await syncIplMatches();
    await AuditLog.create({ actorId: me._id, action: "ipl.sync", meta: r });
    revalidatePath("/admin/matches");
    revalidatePath("/matches");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function refreshSquadsAction(matchId: string) {
  await requireRole("admin", "superadmin");
  try {
    const r = await refreshSquads(matchId);
    revalidatePath(`/matches/${matchId}`);
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function syncPlayoffsAction() {
  const me = await requireRole("superadmin");
  try {
    const r = await syncIplMatches({ includePlayoffs: true });
    await AuditLog.create({ actorId: me._id, action: "ipl.sync.playoffs", meta: r });
    revalidatePath("/admin/matches");
    revalidatePath("/matches");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function refreshMatchPlayersAction(matchId: string) {
  await requireRole("admin", "superadmin");
  try {
    const r = await refreshMatchPlayers(matchId);
    revalidatePath(`/matches/${matchId}`);
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function fetchContestPointsAction(payload: unknown) {
  await requireRole("admin", "superadmin");
  await connectDB();

  const FetchContestPointsSchema = z.object({
    matchId: z.string().min(1),
  });

  const parsed = FetchContestPointsSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid payload" };
  }

  const { matchId: targetMatchId } = parsed.data;

  const match = await Match.findById(targetMatchId).select("contestUrl").lean();
  if (!match?.contestUrl) {
    return { ok: false as const, error: "Add the contest link first" };
  }

  try {
    const leaderboard = await fetchLeaderboardFromContestUrl(match.contestUrl);
    const users = await User.find().select("username userId my11circleName").lean();

    const leaderboardMap = new Map(
      leaderboard.entries.map((row) => [normalizeMy11circleName(row.username), row])
    );

    const entries = users.map((user) => {
      const key = user.my11circleName ? normalizeMy11circleName(user.my11circleName) : "";
      const hit = key ? leaderboardMap.get(key) : undefined;
      return {
        userId: String(user._id),
        username: user.username,
        handle: user.userId,
        my11circleName: user.my11circleName ?? "",
        fantasyPoints: hit?.totalScore ?? 0,
        found: !!hit,
      };
    });

    return {
      ok: true as const,
      contestId: leaderboard.contestId,
      sourceMatchId: leaderboard.matchId,
      entries,
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Failed to fetch contest points",
    };
  }
}

/** Admin/superadmin: regenerate storyline facts for the most recently scored
 * match. Useful to preview/refresh the dashboard storyline card without
 * waiting for the next match to be scored. */
export async function regenerateLatestFactsAction() {
  await requireRole("admin", "superadmin");
  await connectDB();
  const latest = await Match.findOne({ resultsEntered: true })
    .sort({ startTime: -1 })
    .select("_id teamA teamB")
    .lean();
  if (!latest) {
    return { ok: false as const, error: "No scored match found yet" };
  }
  const { generateFactsForMatch } = await import("@/services/facts");
  const facts = await generateFactsForMatch(String(latest._id));
  revalidatePath("/dashboard");
  return {
    ok: true as const,
    matchLabel: `${latest.teamA} vs ${latest.teamB}`,
    count: facts.length,
  };
}

/** Super-admin only. Fires a sample reminder to themselves through both
 * channels (in-app notification + WhatsApp if configured). Used to verify
 * the WhatsApp Cloud API is wired correctly without waiting for cron. */
export async function sendTestReminderAction() {
  const me = await requireRole("superadmin");
  const { Notification } = await import("@/models/Notification");
  const { sendWhatsApp } = await import("@/lib/whatsapp");

  const text = `🏏 Test reminder · ${new Date().toLocaleString()} · If you receive this on WhatsApp, the Cloud API is wired correctly.`;

  await connectDB();
  await Notification.create({
    userId: me._id,
    title: "Test reminder",
    body: text,
  });

  let whatsappOk = false;
  let whatsappError: string | null = null;
  if (me.whatsapp) {
    try {
      // Use approved template variables; for the default hello_world template
      // these are ignored. For prediction_reminder they fill the body.
      whatsappOk = await sendWhatsApp(me.whatsapp, {
        teamA: "Test",
        teamB: "Reminder",
        url: env.APP_URL,
      });
      if (!whatsappOk)
        whatsappError =
          "WhatsApp send failed — check WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID and that your number is added as a test recipient in Meta dashboard.";
    } catch (e) {
      whatsappError = (e as Error).message;
    }
  } else {
    whatsappError = "No WhatsApp number on your profile";
  }

  await AuditLog.create({
    actorId: me._id,
    action: "reminder.test",
    meta: { whatsappOk, whatsappError },
  });

  return {
    ok: true as const,
    notification: true,
    whatsappOk,
    whatsappError,
    sentTo: me.whatsapp ?? null,
  };
}
