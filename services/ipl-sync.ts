import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { scrapeSchedule, scrapeSquad } from "@/lib/scrapers/sportskeeda";
import {
  scrapeCricbuzzListings,
  scrapeCricbuzzMatchSquad,
} from "@/lib/scrapers/cricbuzz-match";

const SEASON = process.env.IPL_SEASON || String(new Date().getUTCFullYear());

export async function syncIplMatches(opts: { includePlayoffs?: boolean } = {}) {
  await connectDB();
  const fixtures = await scrapeSchedule(SEASON, opts);

  // Clean up any previously-imported TBD vs TBD playoff rows that were never
  // claimed by real teams (so list doesn't show ghost matches).
  const tbdDeleted = await Match.deleteMany({
    teamA: "TBD",
    teamB: "TBD",
    resultsEntered: false,
  });

  let created = 0;
  let updated = 0;

  for (const f of fixtures) {
    const existing = await Match.findOne({ externalId: f.externalId });
    if (existing) {
      if (!existing.resultsEntered) {
        existing.startTime = f.startTime;
        existing.venue = f.venue ?? existing.venue;
        existing.stage = f.stage;
        await existing.save();
        updated++;
      }
      continue;
    }
    await Match.create({
      externalId: f.externalId,
      teamA: f.teamA,
      teamB: f.teamB,
      venue: f.venue,
      startTime: f.startTime,
      status: "upcoming",
      stage: f.stage,
    });
    created++;
  }
  return {
    created,
    updated,
    total: fixtures.length,
    season: SEASON,
    includedPlayoffs: !!opts.includePlayoffs,
    tbdRemoved: tbdDeleted.deletedCount ?? 0,
  };
}

export async function refreshSquads(matchId: string) {
  await connectDB();
  const m = await Match.findById(matchId);
  if (!m) throw new Error("Match not found");
  const [a, b] = await Promise.all([scrapeSquad(m.teamA), scrapeSquad(m.teamB)]);
  if (a.length) m.squadA = a;
  if (b.length) m.squadB = b;
  await m.save();
  return { squadA: m.squadA?.length ?? 0, squadB: m.squadB?.length ?? 0 };
}

/** Look up cricbuzz id+slug from the live-scores carousel and persist them. */
export async function resolveCricbuzzId(matchId: string) {
  await connectDB();
  const m = await Match.findById(matchId);
  if (!m) throw new Error("Match not found");
  if (m.cricbuzzId && m.cricbuzzSlug) return { cricbuzzId: m.cricbuzzId, slug: m.cricbuzzSlug };

  const listings = await scrapeCricbuzzListings(SEASON);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "");
  const want = [norm(m.teamA), norm(m.teamB)].sort();
  const hit = listings.find((L) => {
    const got = [norm(L.team1), norm(L.team2)].sort();
    return (
      (got[0].includes(want[0]) || want[0].includes(got[0])) &&
      (got[1].includes(want[1]) || want[1].includes(got[1]))
    );
  });
  if (!hit) {
    throw new Error(
      "This match isn't published on Cricbuzz yet. Cricbuzz typically posts match IDs 1–2 days before the game. Try again closer to start time."
    );
  }
  m.cricbuzzId = hit.id;
  m.cricbuzzSlug = hit.slug;
  m.teamAShort = m.teamAShort ?? hit.team1Short;
  m.teamBShort = m.teamBShort ?? hit.team2Short;
  await m.save();
  return { cricbuzzId: hit.id, slug: hit.slug };
}

/** Fetch structured roster (Cricbuzz squads page) and store on match. */
export async function refreshMatchPlayers(matchId: string) {
  await connectDB();
  let { cricbuzzId, slug } = await resolveCricbuzzId(matchId);
  let players = await scrapeCricbuzzMatchSquad(cricbuzzId, slug);
  console.log(
    `[refreshMatchPlayers] matchId=${matchId} cricbuzzId=${cricbuzzId} slug=${slug} scraped=${players.length}`
  );

  // Cached cricbuzzId/slug may be stale (Cricbuzz sometimes renames slugs).
  // If we got nothing, clear the cache and re-resolve once from the listings.
  if (!players.length) {
    const stale = await Match.findById(matchId);
    if (stale) {
      stale.cricbuzzId = undefined;
      stale.cricbuzzSlug = undefined;
      await stale.save();
    }
    const fresh = await resolveCricbuzzId(matchId);
    cricbuzzId = fresh.cricbuzzId;
    slug = fresh.slug;
    players = await scrapeCricbuzzMatchSquad(cricbuzzId, slug);
    console.log(
      `[refreshMatchPlayers retry] cricbuzzId=${cricbuzzId} slug=${slug} scraped=${players.length}`
    );
  }

  if (!players.length) throw new Error("Cricbuzz returned no players for this match");
  const m = await Match.findById(matchId);
  if (!m) throw new Error("Match not found");
  m.players = players;
  m.playersFetchedAt = new Date();
  await m.save();
  console.log(`[refreshMatchPlayers] saved=${m.players?.length ?? 0}`);
  return { players: players.length, fetchedAt: m.playersFetchedAt, names: players.map((p) => p.name) };
}

