import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/rbac";
import { syncIplMatches } from "@/services/ipl-sync";
import { autoUpdateMatchStatuses } from "@/services/match-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdminFeature("matches.manage");
  } catch {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const includePlayoffs = ["1", "true", "yes"].includes(
      (searchParams.get("includePlayoffs") ?? "").toLowerCase()
    );

    const sync = await syncIplMatches({ includePlayoffs });
    const status = await autoUpdateMatchStatuses();

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      includePlayoffs,
      sync,
      status,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
