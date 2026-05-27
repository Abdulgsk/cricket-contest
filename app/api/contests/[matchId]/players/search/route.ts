import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { searchPlayersForMatch } from "@/services/player-ownership";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    await requireUser();
    const { matchId } = await params;
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const limitRaw = Number(url.searchParams.get("limit") ?? "12");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 12;
    const players = await searchPlayersForMatch({ matchId, query: q, limit });
    return NextResponse.json({ ok: true, players });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
