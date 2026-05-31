// Cricbuzz scorecard scraper. The scorecard is rendered inside the Next.js
// flight payload (self.__next_f.push) as JSON, NOT as plain HTML. We decode the
// flight, locate the `scoreCard` array, and extract per-player batting/bowling
// stats keyed by Cricbuzz profile id (batId/bowlerId/fielderId == profile id,
// which is the same id our squad scraper stores). That lets fantasy scoring
// join players by numeric id and avoid all name-matching/case problems.
import { fetchHtml } from "./util";

/** Per-player batting line from the scorecard. */
export interface ScorecardBatting {
  id: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  strikeRate: number;
  /** True if the batter was dismissed (i.e. not "not out" / did-not-bat). */
  out: boolean;
  outDesc: string;
  wicketCode: string; // CAUGHT, BOWLED, LBW, RUNOUT, STUMPED, ...
  bowlerId: string | null;
  fielderIds: string[]; // catcher/stumper/run-out fielders, by profile id
  inMatchChange: string;
  playingXIChange: string;
}

/** Per-player bowling line from the scorecard. */
export interface ScorecardBowling {
  id: string;
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  dots: number;
  wides: number;
  noBalls: number;
}

export interface ScorecardInnings {
  inningsId: number;
  batTeamShort: string;
  batTeamName: string;
  batting: ScorecardBatting[];
  bowling: ScorecardBowling[];
}

export interface MatchScorecard {
  matchId: number;
  innings: ScorecardInnings[];
  /** True if we found at least one innings with players. */
  hasData: boolean;
}

/** Concatenate all flight payloads on the page and JSON-decode the escaped string. */
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

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function idStr(v: unknown): string | null {
  const n = num(v);
  return n > 0 ? String(Math.trunc(n)) : null;
}

/**
 * Extract the `scoreCard` array from the decoded flight string. The flight is a
 * giant JSON-ish string; we locate `"scoreCard":[` and balance brackets to slice
 * the array, then JSON.parse it. Returns [] if not present.
 */
function extractScoreCard(flight: string): unknown[] {
  const key = '"scoreCard":';
  const at = flight.indexOf(key);
  if (at === -1) return [];
  const start = flight.indexOf("[", at);
  if (start === -1) return [];
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < flight.length; i++) {
    const c = flight[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return [];
  try {
    return JSON.parse(flight.slice(start, end)) as unknown[];
  } catch {
    return [];
  }
}

type Dict = Record<string, unknown>;

function parseInnings(inn: Dict): ScorecardInnings {
  const batDetails = (inn.batTeamDetails ?? {}) as Dict;
  const bowlDetails = (inn.bowlTeamDetails ?? {}) as Dict;
  const batsmenData = (batDetails.batsmenData ?? {}) as Dict;
  const bowlersData = (bowlDetails.bowlersData ?? {}) as Dict;

  const batting: ScorecardBatting[] = [];
  for (const key of Object.keys(batsmenData)) {
    const b = batsmenData[key] as Dict;
    const id = idStr(b.batId);
    if (!id) continue;
    const outDesc = String(b.outDesc ?? "").trim();
    const wicketCode = String(b.wicketCode ?? "").trim().toUpperCase();
    // A batter is "out" if there's a wicketCode or an outDesc that isn't blank
    // or "not out". Did-not-bat rows have empty outDesc and no balls.
    const notOut = !outDesc || /^not out$/i.test(outDesc);
    const fielderIds = [b.fielderId1, b.fielderId2, b.fielderId3]
      .map(idStr)
      .filter((x): x is string => x !== null);
    batting.push({
      id,
      name: String(b.batName ?? b.batShortName ?? "").trim(),
      runs: num(b.runs),
      balls: num(b.balls),
      fours: num(b.fours),
      sixes: num(b.sixes),
      dots: num(b.dots),
      strikeRate: num(b.strikeRate),
      out: !notOut,
      outDesc,
      wicketCode,
      bowlerId: idStr(b.bowlerId),
      fielderIds,
      inMatchChange: String(b.inMatchChange ?? "").trim(),
      playingXIChange: String(b.playingXIChange ?? "").trim(),
    });
  }

  const bowling: ScorecardBowling[] = [];
  for (const key of Object.keys(bowlersData)) {
    const w = bowlersData[key] as Dict;
    const id = idStr(w.bowlerId);
    if (!id) continue;
    bowling.push({
      id,
      name: String(w.bowlName ?? w.bowlShortName ?? "").trim(),
      overs: num(w.overs),
      maidens: num(w.maidens),
      runs: num(w.runs),
      wickets: num(w.wickets),
      economy: num(w.economy),
      dots: num(w.dots),
      wides: num(w.wides),
      noBalls: num(w.no_balls),
    });
  }

  return {
    inningsId: num(inn.inningsId),
    batTeamShort: String(batDetails.batTeamShortName ?? "").trim(),
    batTeamName: String(batDetails.batTeamName ?? "").trim(),
    batting,
    bowling,
  };
}

/** Fetch and parse a Cricbuzz scorecard by match id + slug. */
export async function scrapeCricbuzzScorecard(
  cricbuzzId: string,
  slug: string
): Promise<MatchScorecard> {
  const url = `https://www.cricbuzz.com/live-cricket-scorecard/${cricbuzzId}/${slug}`;
  const html = await fetchHtml(url);
  const flight = decodeFlight(html);
  const raw = extractScoreCard(flight);

  const innings = raw
    .map((inn) => parseInnings(inn as Dict))
    .filter((i) => i.batting.length || i.bowling.length);

  return {
    matchId: Number(cricbuzzId),
    innings,
    hasData: innings.length > 0,
  };
}
