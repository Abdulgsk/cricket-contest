// Sportskeeda scrapers: schedule, points table, squads, winners.
// No API key required.
import * as cheerio from "cheerio";
import { fetchHtml, fetchJson, slug } from "./util";

export interface ScrapedMatch {
  externalId: string;
  teamA: string;
  teamB: string;
  venue?: string;
  startTime: Date;
  rawDate: string;
  rawTime: string;
  stage: "League" | "Qualifier 1" | "Eliminator" | "Qualifier 2" | "Final";
}

/** Map team name → Sportskeeda team-page slug. */
export const TEAM_SLUGS: Record<string, string> = {
  "mumbai indians": "mumbai-indians",
  "royal challengers bengaluru": "royal-challengers-bengaluru",
  "royal challengers bangalore": "royal-challengers-bengaluru",
  "chennai super kings": "chennai-super-kings",
  "delhi capitals": "delhi-capitals",
  "punjab kings": "punjab-kings",
  "kolkata knight riders": "kolkata-knight-riders",
  "rajasthan royals": "rajasthan-royals",
  "sunrisers hyderabad": "sunrisers-hyderabad",
  "gujarat titans": "gujarat-titans",
  "lucknow super giants": "lucknow-super-giants",
};

export function teamSlug(name: string): string | null {
  const n = name.trim().toLowerCase();
  return TEAM_SLUGS[n] ?? null;
}

/** Parse schedule from Sportskeeda's IPL hub.
 * Source of truth = `data-match-slug`. Handles league + playoff slugs.
 */
export async function scrapeSchedule(
  _season: string,
  _opts: { includePlayoffs?: boolean } = {}
): Promise<ScrapedMatch[]> {
  const html = await fetchHtml("https://www.sportskeeda.com/go/ipl/schedule");
  const $ = cheerio.load(html);
  const out: ScrapedMatch[] = [];
  const seen = new Set<string>();

  $("div.cricket-match-card-container[data-match-slug]").each((_, card) => {
    const $card = $(card);
    const matchSlug = ($card.attr("data-match-slug") ?? "").trim();
    if (!matchSlug || matchSlug.includes("' +")) return;

    const parsed = parseSlug(matchSlug);
    if (!parsed) return;
    // Import every scheduled match — league + all playoffs, including
    // placeholder TBD vs TBD playoff rows so the fixtures list mirrors
    // the official schedule exactly.

    const venue = $card
      .find("span.cricket-match-card--match-venue")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join(", ");

    // Real start time is in `data-utc-date-time` on the timer node.
    // e.g. "2026-05-10T10:00:00+00:00" (afternoon match) vs "...T14:00:00..." (evening).
    const utcAttr = $card
      .find("[data-utc-date-time]")
      .first()
      .attr("data-utc-date-time");
    let startTime = parsed.fallbackStartTime;
    let rawTime = "TBD";
    if (utcAttr) {
      const t = new Date(utcAttr);
      if (!Number.isNaN(t.getTime())) {
        startTime = t;
        rawTime = utcAttr;
      }
    }

    const externalId = `sk-${matchSlug}`;
    if (seen.has(externalId)) return;
    seen.add(externalId);

    out.push({
      externalId,
      teamA: parsed.teamA,
      teamB: parsed.teamB,
      venue: venue || undefined,
      startTime,
      rawDate: parsed.rawDate,
      rawTime,
      stage: parsed.stage,
    });
  });

  return out;
}

const FULL_NAMES: Record<string, string> = {
  "mumbai-indians": "Mumbai Indians",
  "royal-challengers-bengaluru": "Royal Challengers Bengaluru",
  "royal-challengers-bangalore": "Royal Challengers Bengaluru",
  "chennai-super-kings": "Chennai Super Kings",
  "delhi-capitals": "Delhi Capitals",
  "punjab-kings": "Punjab Kings",
  "kolkata-knight-riders": "Kolkata Knight Riders",
  "rajasthan-royals": "Rajasthan Royals",
  "sunrisers-hyderabad": "Sunrisers Hyderabad",
  "gujarat-titans": "Gujarat Titans",
  "lucknow-super-giants": "Lucknow Super Giants",
};

const TEAM_PIECES = Object.keys(FULL_NAMES).sort((a, b) => b.length - a.length);

/** Parse match-NN league + playoff slugs into typed match. */
function parseSlug(
  slug: string
):
  | {
      teamA: string;
      teamB: string;
      fallbackStartTime: Date;
      rawDate: string;
      stage: "League" | "Qualifier 1" | "Eliminator" | "Qualifier 2" | "Final";
    }
  | null {
  // Playoffs: Sportskeeda uses two slug shapes
  //   TBD form:        "tba-vs-tba-qualifier-1-ipl-2026t20-26-may-2026"
  //   Real-teams form: "royal-challengers-bengaluru-vs-gujarat-titans-qualifier-1-26-may-2026"
  // The "ipl-NNNNtNN" segment is optional.
  const playoff = slug.match(
    /^(.+?)-vs-(.+?)-(qualifier-1|qualifier-2|eliminator|final)(?:-ipl-\d+t\d+)?-(\d{1,2})-([a-z]+)-(\d{4})$/
  );
  if (playoff) {
    const [, aSlug, bSlug, kind, dd, monthName, yyyy] = playoff;
    const month = MONTHS[monthName.toLowerCase().slice(0, 3)];
    if (month === undefined) return null;
    const stageMap = {
      "qualifier-1": "Qualifier 1",
      "qualifier-2": "Qualifier 2",
      eliminator: "Eliminator",
      final: "Final",
    } as const;
    return {
      teamA: aSlug === "tba" ? "TBD" : FULL_NAMES[aSlug] ?? prettify(aSlug),
      teamB: bSlug === "tba" ? "TBD" : FULL_NAMES[bSlug] ?? prettify(bSlug),
      fallbackStartTime: new Date(Date.UTC(Number(yyyy), month, Number(dd), 14, 0, 0)),
      rawDate: `${dd} ${monthName} ${yyyy}`,
      stage: stageMap[kind as keyof typeof stageMap],
    };
  }

  // League: "team-a-vs-team-b-match-NN-DD-month-YYYY"
  const m = slug.match(/^(.+?)-match-\d+-(\d{1,2})-([a-z]+)-(\d{4})$/);
  if (!m) return null;
  const [, teamPart, dd, monthName, yyyy] = m;
  const month = MONTHS[monthName.toLowerCase().slice(0, 3)];
  if (month === undefined) return null;

  const [aSlug, bSlug] = teamPart.split("-vs-");
  if (!aSlug || !bSlug) return null;

  const teamA = FULL_NAMES[aSlug] ?? matchKnownTeam(aSlug) ?? prettify(aSlug);
  const teamB = FULL_NAMES[bSlug] ?? matchKnownTeam(bSlug) ?? prettify(bSlug);

  const fallbackStartTime = new Date(Date.UTC(Number(yyyy), month, Number(dd), 14, 0, 0));
  if (Number.isNaN(fallbackStartTime.getTime())) return null;

  return {
    teamA,
    teamB,
    fallbackStartTime,
    rawDate: `${dd} ${monthName} ${yyyy}`,
    stage: "League",
  };
}

function matchKnownTeam(s: string): string | null {
  for (const piece of TEAM_PIECES) {
    if (s === piece || s.startsWith(piece + "-") || s.endsWith("-" + piece)) {
      return FULL_NAMES[piece];
    }
  }
  return null;
}

function prettify(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Per-team squad list (player full names). */
export async function scrapeSquad(teamName: string): Promise<string[]> {
  const tslug = teamSlug(teamName);
  if (!tslug) return [];
  const html = await fetchHtml(`https://www.sportskeeda.com/team/${tslug}/squad`);
  const $ = cheerio.load(html);
  const names = new Set<string>();
  $("section.team-full-squad div.team-squad-player").each((_, el) => {
    const name = $(el).find("span.team-squad-player--name").text().trim();
    if (name) names.add(name);
  });
  return [...names];
}

export interface PointsRow {
  team: string;
  played: number;
  won: number;
  lost: number;
  noResult: number;
  netRunRate: number;
  points: number;
}

/** Sportskeeda's CF JSON points-table endpoint (no scraping needed, pure JSON). */
export async function scrapePointsTable(): Promise<PointsRow[]> {
  type Resp = {
    table: { table: { group: Record<string, unknown>[] }[] }[];
  };
  const data = await fetchJson<Resp>("https://cf-gotham.sportskeeda.com/cricket/ipl/points-table");
  const teams = data?.table?.[0]?.table?.[0]?.group ?? [];
  return teams.map((t) => ({
    team: String(t.team_name ?? "Unknown"),
    played: Number(t.played ?? 0),
    won: Number(t.won ?? 0),
    lost: Number(t.lost ?? 0),
    noResult: Number(t.no_result ?? 0),
    netRunRate: Number(t.nrr ?? 0),
    points: Number(t.points ?? 0),
  }));
}

export interface WinnerRow {
  year: string;
  winner: string;
  wonBy: string;
  runnerUp: string;
  venue: string;
}

export async function scrapeWinners(): Promise<WinnerRow[]> {
  const html = await fetchHtml(
    "https://www.sportskeeda.com/cricket/ipl-winners-list?ref=carousel"
  );
  const $ = cheerio.load(html);
  const out: WinnerRow[] = [];
  const rows = $('table[border="1"] tbody tr').length
    ? $('table[border="1"] tbody tr')
    : $("table tbody tr");

  rows.each((i, tr) => {
    if (i === 0) return; // header
    const cells = $(tr)
      .find("td")
      .map((_, td) => $(td).text().trim())
      .get();
    if (cells.length === 5) {
      const [year, winner, wonBy, runnerUp, venue] = cells;
      out.push({ year, winner, wonBy, runnerUp, venue });
    } else if (cells.length === 4) {
      const [year, winner, wonBy, venue] = cells;
      const m = wonBy.match(/against\s+([A-Za-z0-9 ()&.\-]+)/);
      out.push({ year, winner, wonBy, runnerUp: m?.[1].trim() ?? "N/A", venue });
    }
  });
  return out;
}

/** Best-effort match: convert two team names into the canonical name we stored. */
export { slug };
