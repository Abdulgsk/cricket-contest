"use server";

import { z } from "zod";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { CustomPool } from "@/models/CustomPool";
import { CustomPoolPrediction } from "@/models/CustomPoolPrediction";
import { requireRole, requireUser } from "@/lib/rbac";

const CreatePoolSchema = z.object({
  matchId: z.string().min(1),
  question: z.string().min(3).max(200),
  options: z.array(z.string().min(1)).min(2).max(13),
  pointsValue: z.number().int().min(1).max(50),
});

export async function createCustomPoolAction(payload: unknown) {
  const me = await requireRole("admin", "superadmin");
  const parsed = CreatePoolSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };
  await connectDB();
  const match = await Match.findById(parsed.data.matchId);
  if (!match) return { ok: false as const, error: "Match not found" };
  if (match.startTime <= new Date()) {
    return { ok: false as const, error: "Cannot add pool after match started" };
  }
  await CustomPool.create({
    matchId: parsed.data.matchId,
    question: parsed.data.question,
    options: parsed.data.options.map((o) => o.trim()).filter(Boolean),
    pointsValue: parsed.data.pointsValue,
    createdBy: me._id,
  });
  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath(`/admin/matches/${parsed.data.matchId}/result`);
  return { ok: true as const };
}

export async function deleteCustomPoolAction(poolId: string) {
  await requireRole("admin", "superadmin");
  await connectDB();
  const pool = await CustomPool.findById(poolId);
  if (!pool) return;
  if (pool.scored) throw new Error("Cannot delete a scored pool");
  await CustomPoolPrediction.deleteMany({ poolId });
  await CustomPool.deleteOne({ _id: poolId });
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
  if (match.startTime <= new Date()) {
    return { ok: false as const, error: "Pool is locked" };
  }
  if (!pool.options.includes(choice)) {
    return { ok: false as const, error: "Invalid choice" };
  }
  const existing = await CustomPoolPrediction.findOne({ poolId, userId: me._id });
  if (existing) return { ok: false as const, error: "Already locked in" };

  await CustomPoolPrediction.create({
    poolId,
    matchId: pool.matchId,
    userId: me._id,
    choice,
  });
  revalidatePath(`/matches/${String(pool.matchId)}`);
  return { ok: true as const };
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
    if (!pool.options.includes(r.correctOption)) continue;
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

/** Suspense view for a match's custom pools. Hides choices until match completes. */
export async function getCustomPoolsForMatch(matchId: string, viewerId: string) {
  await connectDB();
  const match = await Match.findById(matchId);
  if (!match) return [];
  const revealed = match.status === "completed";
  const pools = await CustomPool.find({ matchId }).lean();
  const out = [] as Array<{
    id: string;
    question: string;
    options: string[];
    pointsValue: number;
    revealed: boolean;
    scored: boolean;
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
    out.push({
      id: String(p._id),
      question: p.question,
      options: p.options,
      pointsValue: p.pointsValue,
      revealed,
      scored: p.scored,
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
