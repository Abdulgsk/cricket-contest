import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { listMatchTeamHolders } from "@/services/contest";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    await requireUser();
    const { matchId } = await params;
    const holders = await listMatchTeamHolders(matchId);
    return NextResponse.json({ ok: true, holders });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
