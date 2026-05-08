// Cricbuzz mobile scraper — used for live status sync.
// Source: https://m.cricbuzz.com/cricket-match/live-scores
import * as cheerio from "cheerio";
import { fetchHtml } from "./util";

export interface LiveMatch {
  status: "Live" | "Completed" | "Upcoming" | "Unknown";
  teamA: string;
  teamB: string;
  scoreA?: string;
  scoreB?: string;
  statusText?: string;
  matchUrl?: string;
}

export async function scrapeCricbuzzLive(season: string): Promise<LiveMatch[]> {
  const base = "https://m.cricbuzz.com";
  const html = await fetchHtml(`${base}/cricket-match/live-scores`);
  const $ = cheerio.load(html);

  const headers = $(`a[title*="Indian Premier League ${season}"]`).toArray();
  let scope: ReturnType<typeof $> | null = null;
  for (const h of headers) {
    const parent = $(h).parent();
    if (parent.find('a[href*="/live-cricket-scores/"]').length) {
      scope = parent;
      break;
    }
  }
  if (!scope) return [];

  const out: LiveMatch[] = [];
  const seen = new Set<string>();

  scope.find('a[href*="/live-cricket-scores/"]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr("href") ?? "";
    const cls = $a.attr("class") ?? "";
    if (!href || seen.has(href)) return;
    if (!/bg-cbWhite|flex-col/.test(cls)) return;
    seen.add(href);

    const teams: { name: string; score: string }[] = [];
    $a.find("div.flex.items-center.gap-4.justify-between").each((_, row) => {
      const $row = $(row);
      const name =
        $row.find("span.text-cbTxtPrim").first().text().trim() ||
        $row.find("span.text-cbTxtSec").first().text().trim();
      const score =
        $row.find("span.font-medium").first().text().trim() ||
        $row.find("span.font-semibold").first().text().trim();
      if (name || score) teams.push({ name: name || "TBD", score });
    });
    while (teams.length < 2) teams.push({ name: "TBD", score: "" });

    let isLive = false;
    let isComplete = false;
    let isUpcoming = false;
    let statusText = "";
    $a.find("span").each((_, s) => {
      const c = $(s).attr("class") ?? "";
      const t = $(s).text().trim();
      if (/cbLive|text-cbLive/.test(c)) {
        isLive = true;
        if (t) statusText = t;
      } else if (
        /cbComplete/.test(c) &&
        t &&
        !["Live Score", "Scorecard", "Full Commentary", "News"].includes(t)
      ) {
        isComplete = true;
        statusText = t;
      } else if (/cbPreview/.test(c)) {
        isUpcoming = true;
        if (t) statusText = t;
      }
    });

    const status: LiveMatch["status"] = isLive
      ? "Live"
      : isComplete
      ? "Completed"
      : isUpcoming
      ? "Upcoming"
      : "Unknown";

    out.push({
      status,
      teamA: teams[0].name,
      teamB: teams[1].name,
      scoreA: teams[0].score || undefined,
      scoreB: teams[1].score || undefined,
      statusText: statusText || undefined,
      matchUrl: href.startsWith("http") ? href : `${base}${href}`,
    });
  });

  return out;
}
