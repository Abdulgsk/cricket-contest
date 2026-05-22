import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAdminFeature } from "@/lib/rbac";
import { Match } from "@/models/Match";
import { AuditLog } from "@/models/AuditLog";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const me = await requireAdminFeature("automation.run");
    const { matchId } = await params;

    await connectDB();
    const match = await Match.findById(matchId);
    if (!match) {
      return NextResponse.json({ ok: false, error: "match_not_found" }, { status: 404 });
    }

    const before = {
      status: match.status,
      resultsEntered: !!match.resultsEntered,
      predictionsLocked: !!match.predictionsLocked,
    };

    match.status = "completed";
    match.predictionsLocked = true;
    await match.save();

    await AuditLog.create({
      actorId: me._id,
      action: "match.forceComplete",
      meta: {
        matchId,
        before,
        after: {
          status: match.status,
          resultsEntered: !!match.resultsEntered,
          predictionsLocked: !!match.predictionsLocked,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      matchId,
      forced: true,
      before,
      after: {
        status: match.status,
        resultsEntered: !!match.resultsEntered,
        predictionsLocked: !!match.predictionsLocked,
      },
      note: "Forced to completed without requiring resultsEntered",
      ranAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
}
