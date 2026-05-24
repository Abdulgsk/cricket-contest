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

  let created = 0;
  let updated = 0;
  let promotedFromTbd = 0;

  for (const f of fixtures) {
    // 1) Exact externalId match (steady state once team names are known).
    let existing = await Match.findOne({ externalId: f.externalId });

    // 2) Playoff placeholder reconciliation: when a slot like
    //    "tba-vs-tba-qualifier-1-..." flips to real teams, the externalId
    //    changes. Re-bind the same DB row by stage + same calendar day so
    //    predictions / ids stay stable instead of creating a duplicate.
    if (!existing && f.stage !== "League") {
      const dayStart = new Date(f.startTime);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      existing = await Match.findOne({
        stage: f.stage,
        startTime: { $gte: dayStart, $lt: dayEnd },
        resultsEntered: false,
      });
      if (existing) {
        const wasTbd = existing.teamA === "TBD" || existing.teamB === "TBD";
        existing.externalId = f.externalId;
        if (wasTbd && (f.teamA !== "TBD" || f.teamB !== "TBD")) promotedFromTbd++;
      }
    }

    if (existing) {
      if (!existing.resultsEntered) {
        existing.startTime = f.startTime;
        existing.venue = f.venue ?? existing.venue;
        existing.stage = f.stage;
        // Keep team names in sync — playoff placeholders flip from "TBD"
        // to real teams as the schedule firms up.
        if (existing.teamA !== f.teamA) existing.teamA = f.teamA;
        if (existing.teamB !== f.teamB) existing.teamB = f.teamB;
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
    promotedFromTbd,
    total: fixtures.length,
    season: SEASON,
    includedPlayoffs: !!opts.includePlayoffs,
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
  }

  if (!players.length) throw new Error("Cricbuzz returned no players for this match");
  const m = await Match.findById(matchId);
  if (!m) throw new Error("Match not found");
  m.players = players;
  m.playersFetchedAt = new Date();
  await m.save();
  return { players: players.length, fetchedAt: m.playersFetchedAt, names: players.map((p) => p.name) };
}

