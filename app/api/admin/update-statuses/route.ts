import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { autoUpdateMatchStatuses } from "@/services/match-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("admin", "superadmin");
  } catch {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const status = await autoUpdateMatchStatuses();
    return NextResponse.json({ ok: true, status, ranAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
