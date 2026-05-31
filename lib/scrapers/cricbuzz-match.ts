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
  /** Cricbuzz player profile id (from /profiles/<id>/...). */
  profileId?: string;
  /** Resolved face-image URL (filled in by resolveSquadImages). */
  imgUrl?: string;
  /** Post-toss XI status: "playing" (announced XI), "bench" (impact pool), "" (unknown). */
  playingStatus?: "playing" | "bench" | "";
  /** "IN" once this player has come on as the live Impact Player. */
  playingXIChange?: "IN" | "";
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

  // Post-toss playing-XI / bench / impact status (from the flight payload).
  const status = parseSquadStatus(html);

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
    const st = status.byId.get(id);
    out.push({
      name,
      role,
      captain,
      keeper,
      profileId: id,
      playingStatus: status.announced ? st?.status ?? "bench" : "",
      playingXIChange: st?.impactIn ? "IN" : "",
    });
  }
  return out;
}

/**
 * Parse the announced playing-XI / bench / impact-player status from the squads
 * page flight payload. Cricbuzz groups players under
 *   players":{"playing XI":[...],"bench":[...]}
 * and tags each with `"substitute":true|false` (true = bench/impact pool) and
 * `"playingXIChange":"IN"` once an impact sub has actually come on.
 *
 * Returns `announced=false` (and an empty map) until the XI is published, so the
 * picker can show a flat list pre-toss and grouped lists post-toss.
 */
function parseSquadStatus(html: string): {
  announced: boolean;
  byId: Map<string, { status: "playing" | "bench"; impactIn: boolean }>;
} {
  const byId = new Map<string, { status: "playing" | "bench"; impactIn: boolean }>();
  const flight = decodeFlight(html);
  if (!flight) return { announced: false, byId };
  // The grouping key only exists once an XI is announced.
  const announced = flight.includes('"playing XI"');
  if (!announced) return { announced: false, byId };

  // id + substitute flag (fields appear in this fixed order before imageDetails).
  const reSub =
    /"id":(\d+),"name":"(?:[^"\\]|\\.)*?","fullName":"(?:[^"\\]|\\.)*?","nickName":"(?:[^"\\]|\\.)*?","captain":(?:true|false),"role":"[^"]*","keeper":(?:true|false),"substitute":(true|false)/g;
  let m: RegExpExecArray | null;
  while ((m = reSub.exec(flight))) {
    byId.set(m[1], { status: m[2] === "true" ? "bench" : "playing", impactIn: false });
  }
  // Impact players who have come on: "playingXIChange":"IN" keyed by profileUrl id.
  const reIn = /"profileUrl":"\/profiles\/(\d+)\/[^"]*","playingXIChange":"IN"/g;
  while ((m = reIn.exec(flight))) {
    const cur = byId.get(m[1]);
    if (cur) cur.impactIn = true;
    else byId.set(m[1], { status: "playing", impactIn: true });
  }
  return { announced, byId };
}

/**
 * Resolve face-image URLs for a squad. Cricbuzz only exposes a player's
 * `faceImageId` on their individual profile page, so we fetch each profile
 * once (concurrency-limited, best-effort) and build the static CDN URL:
 *   https://static.cricbuzz.com/a/img/v1/144x144/i1/c<faceImageId>/i.jpg
 * The filename slug is ignored by the CDN, so only the id matters.
 *
 * Mutates `players` in place, adding `imgUrl` where resolvable. Never throws —
 * a missing image just leaves `imgUrl` undefined (UI falls back to initials).
 */
const FACE_ID_RE = /faceImageId\\?":\s*(\d+)/;
const faceIdCache = new Map<string, string | null>();

export async function resolveSquadImages(
  players: CricbuzzPlayer[],
  concurrency = 5
): Promise<void> {
  const targets = players.filter((p) => p.profileId && !p.imgUrl);
  let i = 0;
  async function worker() {
    while (i < targets.length) {
      const p = targets[i++];
      const pid = p.profileId!;
      try {
        let faceId = faceIdCache.get(pid);
        if (faceId === undefined) {
          const html = await fetchHtml(
            `https://www.cricbuzz.com/profiles/${pid}/x`
          );
          const m = html.match(FACE_ID_RE);
          faceId = m ? m[1] : null;
          faceIdCache.set(pid, faceId);
        }
        if (faceId) {
          p.imgUrl = `https://static.cricbuzz.com/a/img/v1/144x144/i1/c${faceId}/i.jpg`;
        }
      } catch {
        // best-effort; leave imgUrl undefined
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, worker)
  );
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

export async function scrapeCricbuzzListings(_season: string): Promise<CricbuzzListing[]> {
  void _season;
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

  // 1) Series page: <a title="Team A vs Team B, <stage>[ - state]" href="/live-cricket-scores/<id>/<slug>">
  //    Stage is either "NNth Match" (group stage) or one of the playoff
  //    labels: "Qualifier 1", "Eliminator", "Qualifier 2", "Final". Without
  //    the playoff branch, knockout squads (Qualifier 1, etc.) never get
  //    a Cricbuzz id and "Refresh squad" silently no-ops.
  if (seriesHtml) {
    const re =
      /title="([^"]+) vs ([^"]+), (?:\d+(?:st|nd|rd|th) Match|Qualifier \d+|Eliminator|Final)[^"]*"\s+href="\/live-cricket-scores\/(\d+)\/([a-z0-9-]+(?:ipl|indian-premier-league)-2026)"/g;
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
      // Previously this referenced an undefined `${season}` template var which
      // made the regex either throw or never match. Pinned to the same season
      // suffix as the series-page regex.
      const re =
        /"state":"([^"]+)","status":"([^"]+)","team1":\{"teamId":\d+,"teamName":"([^"]+)","teamSName":"([^"]+)"[^}]*\},"team2":\{"teamId":\d+,"teamName":"([^"]+)","teamSName":"([^"]+)"[^}]*\}[\s\S]{0,800}?"matchUrl":"\/live-cricket-scores\/(\d+)\/([a-z0-9-]+(?:ipl|indian-premier-league)-2026)"/g;
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
