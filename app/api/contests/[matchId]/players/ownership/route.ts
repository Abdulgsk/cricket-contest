import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { getPlayerOwnership } from "@/services/player-ownership";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    await requireUser();
    const { matchId } = await params;
    const url = new URL(req.url);
    const my11IdRaw = url.searchParams.get("my11Id");
    const my11Id = Number(my11IdRaw);
    if (!Number.isFinite(my11Id) || my11Id <= 0) {
      return NextResponse.json(
        { ok: false, error: "my11Id required" },
        { status: 400 }
      );
    }
    // Player ownership reveals what others picked — locked until the match is
    // live so nobody can copy line-ups pre-toss.
    await connectDB();
    const match = await Match.findById(matchId).select("status").lean();
    if (match && match.status === "upcoming") {
      return NextResponse.json(
        { ok: false, error: "hidden_until_live" },
        { status: 403 }
      );
    }
    const result = await getPlayerOwnership({ matchId, my11Id });
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "player_not_found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
