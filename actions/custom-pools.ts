"use server";

import { z } from "zod";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { CustomPool } from "@/models/CustomPool";
import { CustomPoolPrediction } from "@/models/CustomPoolPrediction";
import { Notification } from "@/models/Notification";
import { User } from "@/models/User";
import { requireUser, assertFeature } from "@/lib/rbac";
import { isModuleLocked } from "@/lib/match-locks";
import { recordAudit } from "@/lib/audit";

/** Minutes before deadline at which the "closing soon" reminder fires. */
const CLOSING_SOON_WINDOW_MIN = 30;

const CreatePoolSchema = z.object({
  matchId: z.string().min(1),
  question: z.string().min(3).max(200),
  options: z.array(z.string().min(1)).min(2).max(13),
  pointsValue: z.number().int().min(1).max(50),
  closesAt: z.string().datetime().optional(),
});

export async function createCustomPoolAction(payload: unknown) {
  const _auth = await assertFeature("matches.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  const parsed = CreatePoolSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };
  await connectDB();
  const match = await Match.findById(parsed.data.matchId);
  if (!match) return { ok: false as const, error: "Match not found" };
  if (isModuleLocked(match, "predictions")) {
    return { ok: false as const, error: "Cannot add pool after match started" };
  }
  // Deadline: caller-provided OR fall back to the match start time. The
  // deadline is HARD-CAPPED at match start so pools never carry beyond the
  // match they belong to.
  const matchStart = new Date(match.startTime).getTime();
  const requested = parsed.data.closesAt ? new Date(parsed.data.closesAt).getTime() : matchStart;
  if (Number.isNaN(requested)) {
    return { ok: false as const, error: "Invalid deadline" };
  }
  if (requested <= Date.now()) {
    return { ok: false as const, error: "Deadline must be in the future" };
  }
  const closesAt = new Date(Math.min(requested, matchStart));
  const created = await CustomPool.create({
    matchId: parsed.data.matchId,
    question: parsed.data.question,
    options: parsed.data.options.map((o) => o.trim()).filter(Boolean),
    pointsValue: parsed.data.pointsValue,
    closesAt,
    createdBy: me._id,
  });
  await recordAudit({
    category: "create",
    action: "custom-pool.create",
    actor: me,
    targetType: "CustomPool",
    targetId: String(created._id),
    meta: {
      matchId: parsed.data.matchId,
      question: parsed.data.question,
      optionCount: parsed.data.options.length,
      pointsValue: parsed.data.pointsValue,
      closesAt: closesAt.toISOString(),
    },
  });
  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath(`/admin/matches/${parsed.data.matchId}/result`);
  return { ok: true as const };
}

export async function deleteCustomPoolAction(poolId: string) {
  const _auth = await assertFeature("matches.manage");
  if (!_auth.ok) return { ok: false as const, error: _auth.error };
  const me = _auth.user;
  await connectDB();
  const pool = await CustomPool.findById(poolId);
  if (!pool) return;
  if (pool.scored) throw new Error("Cannot delete a scored pool");
  await CustomPoolPrediction.deleteMany({ poolId });
  await CustomPool.deleteOne({ _id: poolId });
  await recordAudit({
    category: "delete",
    action: "custom-pool.delete",
    actor: me,
    targetType: "CustomPool",
    targetId: String(poolId),
    meta: { matchId: String(pool.matchId) },
  });
  revalidatePath(`/matches/${String(pool.matchId)}`);
}

export async function submitCustomPoolPredictionAction(formData: FormData) {
  const me = await requireUser();
  const poolId = String(formData.get("poolId") ?? "");
  const choice = String(formData.get("choice") ?? "");
  if (!poolId || !choice) return { ok: false as const, error: "Invalid input" };

  await connectDB();
  const pool = await CustomPool.findById(poolId);
  if (!pool) return { ok: false as const, error: "Pool not found" };
  const match = await Match.findById(pool.matchId);
  if (!match) return { ok: false as const, error: "Match not found" };
  // Lock at the earlier of: pool's own deadline OR the match-level lock.
  if (Date.now() >= new Date(pool.closesAt).getTime()) {
    return { ok: false as const, error: "Pool deadline has passed" };
  }
  if (isModuleLocked(match, "predictions")) {
    return { ok: false as const, error: "Pool is locked" };
  }
  if (!pool.options.includes(choice)) {
    return { ok: false as const, error: "Invalid choice" };
  }
  const existing = await CustomPoolPrediction.findOne({ poolId, userId: me._id });
  if (existing) {
    if (existing.choice === choice) {
      return { ok: true as const, updated: false as const };
    }
    existing.choice = choice;
    await existing.save();
    await recordAudit({
      category: "update",
      action: "custom-pool.predict.update",
      actor: me,
      targetType: "CustomPool",
      targetId: String(poolId),
      meta: { matchId: String(pool.matchId), choice },
    });
    revalidatePath(`/matches/${String(pool.matchId)}`);
    return { ok: true as const, updated: true as const };
  }

  await CustomPoolPrediction.create({
    poolId,
    matchId: pool.matchId,
    userId: me._id,
    choice,
  });
  await recordAudit({
    category: "create",
    action: "custom-pool.predict",
    actor: me,
    targetType: "CustomPool",
    targetId: String(poolId),
    meta: { matchId: String(pool.matchId), choice },
  });
  revalidatePath(`/matches/${String(pool.matchId)}`);
  return { ok: true as const, updated: false as const };
}

/**
 * Validate a batch of pool results before they're scored. Returns an array of
 * human-readable errors (empty when everything checks out). Callers should
 * abort the whole results submission if any error is present.
 */
export async function validateCustomPoolResults(
  matchId: string,
  results: { poolId: string; correctOption: string }[],
) {
  if (!results.length) return [] as string[];
  await connectDB();
  const ids = results.map((r) => r.poolId);
  const pools = await CustomPool.find({ _id: { $in: ids } }).lean();
  const byId = new Map(pools.map((p) => [String(p._id), p]));
  const errors: string[] = [];
  for (const r of results) {
    const p = byId.get(r.poolId);
    if (!p) {
      errors.push(`Pool ${r.poolId} not found`);
      continue;
    }
    if (String(p.matchId) !== String(matchId)) {
      errors.push(`Pool "${p.question}" belongs to a different match`);
      continue;
    }
    if (!r.correctOption || !p.options.includes(r.correctOption)) {
      errors.push(
        `Pool "${p.question}": "${r.correctOption}" is not one of the configured options`,
      );
    }
  }
  return errors;
}

/** Internal helper used by the result-entry server action. */
export async function scoreCustomPools(
  matchId: string,
  results: { poolId: string; correctOption: string }[]
) {
  await connectDB();
  for (const r of results) {
    const pool = await CustomPool.findById(r.poolId);
    if (!pool || String(pool.matchId) !== String(matchId)) continue;
    if (!pool.options.includes(r.correctOption)) {
      // Defensive: callers should have run validateCustomPoolResults first,
      // but never silently score an answer that doesn't exist.
      throw new Error(
        `Pool "${pool.question}" does not include option "${r.correctOption}"`,
      );
    }
    pool.correctOption = r.correctOption;
    pool.scored = true;
    await pool.save();

    const preds = await CustomPoolPrediction.find({ poolId: pool._id });
    for (const p of preds) {
      p.correct = p.choice === r.correctOption;
      p.pointsAwarded = p.correct ? pool.pointsValue : 0;
      p.scored = true;
      await p.save();
    }
  }
}

/**
 * Lazy reminder: if any open pool for this match closes within the next
 * `CLOSING_SOON_WINDOW_MIN` minutes and we haven't notified yet, ping every
 * member who hasn't predicted. One-shot per pool via `deadlineNotifiedAt`.
 */
async function notifyClosingSoonForMatch(matchId: string) {
  const now = Date.now();
  const soon = now + CLOSING_SOON_WINDOW_MIN * 60_000;
  const pools = await CustomPool.find({
    matchId,
    scored: false,
    deadlineNotifiedAt: null,
    closesAt: { $gt: new Date(now), $lte: new Date(soon) },
  });
  if (!pools.length) return;

  const match = await Match.findById(matchId).select("teamA teamB").lean();
  const matchLabel = match ? `${match.teamA} vs ${match.teamB}` : "the match";
  const allUsers = await User.find({}).select("_id").lean();
  const allUserIds = allUsers.map((u) => String(u._id));

  for (const pool of pools) {
    try {
      const preds = await CustomPoolPrediction.find({ poolId: pool._id })
        .select("userId")
        .lean();
      const haveLocked = new Set(preds.map((p) => String(p.userId)));
      const targets = allUserIds.filter((id) => !haveLocked.has(id));
      const minutesLeft = Math.max(
        1,
        Math.round((new Date(pool.closesAt).getTime() - now) / 60_000),
      );
      const docs = targets.map((id) => ({
        userId: new mongoose.Types.ObjectId(id),
        kind: "match_reminder" as const,
        title: `Side-bet closing in ${minutesLeft}m`,
        body: `"${pool.question}" closes soon \u2014 lock in your pick for ${matchLabel}.`,
        link: `/matches/${String(matchId)}`,
      }));
      if (docs.length) await Notification.insertMany(docs, { ordered: false });
      pool.deadlineNotifiedAt = new Date();
      await pool.save();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[custom-pools.notifyClosingSoon] failed", String(pool._id), err);
    }
  }
}

/** Suspense view for a match's custom pools. Hides choices until match completes. */
export async function getCustomPoolsForMatch(matchId: string, viewerId: string) {
  await connectDB();
  const match = await Match.findById(matchId);
  if (!match) return [];
  // Opportunistic reminder fire — cheap, idempotent via deadlineNotifiedAt.
  await notifyClosingSoonForMatch(matchId).catch(() => undefined);
  const revealed = match.status === "completed";
  const pools = await CustomPool.find({ matchId }).lean();
  const now = Date.now();
  const out = [] as Array<{
    id: string;
    question: string;
    options: string[];
    pointsValue: number;
    revealed: boolean;
    scored: boolean;
    closesAt: string;
    locked: boolean;
    correctOption?: string;
    myChoice?: string;
    totalCount: number;
    split: { choice: string; count: number; pct: number }[];
    allChoices?: { username: string; choice: string; correct?: boolean }[];
  }>;
  for (const p of pools) {
    const all = await CustomPoolPrediction.find({ poolId: p._id })
      .populate("userId", "username userId")
      .lean();
    const total = all.length;
    const counts = new Map<string, number>();
    for (const a of all) counts.set(a.choice, (counts.get(a.choice) ?? 0) + 1);
    const split = p.options.map((o) => ({
      choice: o,
      count: counts.get(o) ?? 0,
      pct: total ? Math.round(((counts.get(o) ?? 0) / total) * 100) : 0,
    }));
    const mine = all.find((a) => String((a.userId as unknown as { _id: unknown })._id) === String(viewerId));
    // Backfill: pools created before the closesAt field existed default to
    // the match start time so the UI still has a sensible deadline to show.
    const closesAtRaw = p.closesAt ? new Date(p.closesAt) : new Date(match.startTime);
    const closesAt = closesAtRaw.toISOString();
    const locked = now >= closesAtRaw.getTime() || isModuleLocked(match, "predictions");
    out.push({
      id: String(p._id),
      question: p.question,
      options: p.options,
      pointsValue: p.pointsValue,
      revealed,
      scored: p.scored,
      closesAt,
      locked,
      correctOption: p.correctOption,
      myChoice: mine?.choice,
      totalCount: total,
      split,
      allChoices: revealed
        ? all.map((a) => ({
            username: (a.userId as unknown as { username: string }).username,
            choice: a.choice,
            correct: a.correct,
          }))
        : undefined,
    });
  }
  return out;
}

void mongoose; // keep import if tree-shaking is aggressive
