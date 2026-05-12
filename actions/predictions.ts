"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac";
import { submitPrediction } from "@/services/prediction-engine";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { refreshMatchPlayers } from "@/services/ipl-sync";

const Schema = z.object({
  matchId: z.string().min(1),
  winner: z.string().min(1),
  topBatter: z.string().min(1),
  topBowler: z.string().min(1),
});

export async function submitPredictionAction(formData: FormData) {
  const me = await requireUser();
  const parsed = Schema.safeParse({
    matchId: formData.get("matchId"),
    winner: formData.get("winner"),
    topBatter: formData.get("topBatter"),
    topBowler: formData.get("topBowler"),
  });
  if (!parsed.success) return { ok: false as const, error: "Invalid input" };
  try {
    await submitPrediction({
      userId: String(me._id),
      ...parsed.data,
    });
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath("/predictions");
  return { ok: true as const };
}

/** On-demand player roster fetch for the prediction dropdown.
 * Any logged-in user may call this. If not yet cached, it scrapes Cricbuzz
 * and stores the roster on the match. Returns clear error message on failure. */
export async function loadMatchPlayersAction(matchId: string) {
  await requireUser();
  await connectDB();
  const m = await Match.findById(matchId).select("players").lean();
  if (m?.players?.length) {
    return {
      ok: true as const,
      players: m.players.map((p) => p.name),
      playerInfo: m.players.map((p) => ({
        name: p.name,
        role: p.role,
        keeper: p.keeper,
      })),
      cached: true,
    };
  }
  try {
    const r = await refreshMatchPlayers(matchId);
    return {
      ok: true as const,
      players: r.names,
      playerInfo: (r.players ?? []).map((p) => ({
        name: p.name,
        role: p.role,
        keeper: p.keeper,
      })),
      cached: false,
      fetched: r.players,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
