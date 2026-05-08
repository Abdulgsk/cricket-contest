// Diagnostic: returns whatever the schedule scraper currently sees (admin-only).
// Useful when the matches page looks empty.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { scrapeSchedule } from "@/lib/scrapers/sportskeeda";
import { scrapeCricbuzzLive } from "@/lib/scrapers/cricbuzz";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("admin", "superadmin");
  } catch {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const season = process.env.IPL_SEASON || String(new Date().getUTCFullYear());
  const [fixtures, live] = await Promise.allSettled([
    scrapeSchedule(season),
    scrapeCricbuzzLive(season),
  ]);
  return NextResponse.json({
    ok: true,
    season,
    fixtures:
      fixtures.status === "fulfilled"
        ? { count: fixtures.value.length, sample: fixtures.value.slice(0, 5) }
        : { error: String(fixtures.reason) },
    live:
      live.status === "fulfilled"
        ? { count: live.value.length, sample: live.value.slice(0, 5) }
        : { error: String(live.reason) },
  });
}
