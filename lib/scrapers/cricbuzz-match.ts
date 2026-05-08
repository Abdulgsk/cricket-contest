// Cricbuzz match-detail scraper.
// The squads page renders player anchors directly: <a href="/profiles/<id>/<slug>">Name(C)Role</a>
// We parse those anchors and keep only known on-field roles (skip coaches/staff).
import { fetchHtml } from "./util";

export interface CricbuzzPlayer {
  name: string;
  role?: string;
  teamShort?: string;
  captain?: boolean;
  keeper?: boolean;
  overseas?: boolean;
}

const PLAYER_ROLES = [
  "WK-Batter",
  "Batting Allrounder",
  "Bowling Allrounder",
  "Allrounder",
  "Batter",
  "Bowler",
] as const;

/** Concatenate all flight payloads on the page and JSON-decode them.
 * Used by the live-scores carousel parser (still serves JSON in HTML). */
function decodeFlight(html: string): string {
  const parts = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(
    (m) => m[1]
  );
  if (!parts.length) return "";
  try {
    return JSON.parse('"' + parts.join("") + '"');
  } catch {
    return parts.join("");
  }
}

/** Pull the structured roster from the squads page.
 * Uses desktop URL so the player anchors render server-side. */
export async function scrapeCricbuzzMatchSquad(
  cricbuzzId: string,
  slug: string
): Promise<CricbuzzPlayer[]> {
  const url = `https://www.cricbuzz.com/cricket-match-squads/${cricbuzzId}/${slug}`;
  const html = await fetchHtml(url);

  // Find all <a href="/profiles/<id>/<slug>">...text...</a> with their text content
  const anchorRe =
    /<a[^>]*href="\/profiles\/(\d+)\/[a-z0-9-]+"[^>]*>([\s\S]*?)<\/a>/g;
  const seen = new Set<string>();
  const out: CricbuzzPlayer[] = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (!text) continue;

    // Match a known on-field role at the END of the text (closest to player name).
    let role: string | undefined;
    let nameAndMarkers = text;
    for (const r of PLAYER_ROLES) {
      if (text.endsWith(r)) {
        role = r;
        nameAndMarkers = text.slice(0, -r.length).trim();
        break;
      }
    }
    if (!role) continue; // skip coaches and other support staff

    // Captain / WK markers are inline like "Riyan Parag(C)" or "Dhruv Jurel(WK)"
    const captain = /\(C\)$/.test(nameAndMarkers);
    const keeper = /\(WK\)$/.test(nameAndMarkers) || role === "WK-Batter";
    const name = nameAndMarkers.replace(/\((C|WK)\)$/g, "").trim();
    if (!name) continue;

    seen.add(id);
    out.push({ name, role, captain, keeper });
  }
  return out;
}

/**
 * Walk the live-scores page and return a map of "team1ShortName-team2ShortName"
 * (sorted) → { id, slug, status, statusText }. Used to associate DB matches with
 * Cricbuzz match IDs so we can deep-link squad/scorecard pages.
 */
export interface CricbuzzListing {
  id: string;
  slug: string;
  state: string;
  status: string;
  team1: string;
  team1Short: string;
  team2: string;
  team2Short: string;
}

export async function scrapeCricbuzzListings(season: string): Promise<CricbuzzListing[]> {
  // Two sources, deduped by match id:
  //   1) IPL series page (desktop) — full team names in title attrs, includes
  //      recent + upcoming matches whose ids have been published.
  //   2) Live-scores carousel (mobile flight payload) — covers any match
  //      currently live or starting within ~30 min, even if ids changed.
  const [seriesHtml, liveHtml] = await Promise.all([
    fetchHtml("https://www.cricbuzz.com/cricket-series/9241/ipl-2026/matches").catch(() => ""),
    fetchHtml("https://m.cricbuzz.com/cricket-match/live-scores").catch(() => ""),
  ]);

  const out: CricbuzzListing[] = [];
  const seen = new Set<string>();

  // 1) Series page: <a title="Team A vs Team B, NNth Match - state" href="/live-cricket-scores/<id>/<slug>">
  if (seriesHtml) {
    const re =
      /title="([^"]+) vs ([^"]+), \d+(?:st|nd|rd|th) Match[^"]*"\s+href="\/live-cricket-scores\/(\d+)\/([a-z0-9-]+(?:ipl|indian-premier-league)-2026)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seriesHtml))) {
      if (seen.has(m[3])) continue;
      seen.add(m[3]);
      out.push({
        state: "Scheduled",
        status: "",
        team1: m[1],
        team1Short: shortFromSlug(m[4], 0),
        team2: m[2],
        team2Short: shortFromSlug(m[4], 1),
        id: m[3],
        slug: m[4],
      });
    }
  }

  // 2) Live carousel
  if (liveHtml) {
    const dec = decodeFlight(liveHtml);
    if (dec) {
      const re =
        /"state":"([^"]+)","status":"([^"]+)","team1":\{"teamId":\d+,"teamName":"([^"]+)","teamSName":"([^"]+)"[^}]*\},"team2":\{"teamId":\d+,"teamName":"([^"]+)","teamSName":"([^"]+)"[^}]*\}[\s\S]{0,800}?"matchUrl":"\/live-cricket-scores\/(\d+)\/([a-z0-9-]+indian-premier-league-${season})"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(dec))) {
        if (seen.has(m[7])) continue;
        seen.add(m[7]);
        out.push({
          state: m[1],
          status: m[2],
          team1: m[3],
          team1Short: m[4],
          team2: m[5],
          team2Short: m[6],
          id: m[7],
          slug: m[8],
        });
      }
    }
  }

  return out;
}

/** Extract team short name from a slug like "rr-vs-gt-52nd-match-...". */
function shortFromSlug(slug: string, idx: 0 | 1): string {
  const m = slug.match(/^([a-z]+)-vs-([a-z]+)-/);
  if (!m) return "";
  return (idx === 0 ? m[1] : m[2]).toUpperCase();
}
