// Daily auto-sync cron: fetches the latest IPL schedule once per day.
// Vercel cron (vercel.json) hits this at e.g. 00:30 UTC every day.
import { NextResponse } from "next/server";
import { syncIplMatches } from "@/services/ipl-sync";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncIplMatches();
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
