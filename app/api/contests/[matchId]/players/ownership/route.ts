import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
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
