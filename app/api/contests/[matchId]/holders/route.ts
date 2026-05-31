import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import {
  listFantasyHolders,
  refreshFantasyContestIfLive,
} from "@/services/contest";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    await requireUser();
    const { matchId } = await params;
    await connectDB();
    const match = await Match.findById(matchId).select("status").lean();
    const status = (match?.status ?? "upcoming") as "upcoming" | "live" | "completed";
    await refreshFantasyContestIfLive(matchId, status);
    const holders = await listFantasyHolders(matchId);
    return NextResponse.json({ ok: true, holders });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
