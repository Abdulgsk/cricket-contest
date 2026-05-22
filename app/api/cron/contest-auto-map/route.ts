// Every few minutes, automatically map any live match to its my11 contest +
// per-user team rows. Once a match is mapped, autoMapDone=true and the cron
// stops touching it. See services/contest-auto-map.ts for the full logic.
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { autoUpdateMatchStatuses } from "@/services/match-status";
import { autoMapAllLiveMatches } from "@/services/contest-auto-map";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // Promote upcoming → live first, so a match that just started is included.
  await autoUpdateMatchStatuses();
  const results = await autoMapAllLiveMatches();
  return NextResponse.json({
    ok: true,
    count: results.length,
    results,
    ranAt: new Date().toISOString(),
  });
}
