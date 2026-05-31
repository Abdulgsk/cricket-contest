import { connectDB } from "@/lib/db";
import { computeLeaderboard, type LeaderboardRow } from "@/services/scoring";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";
import { Rivalry } from "@/models/Rivalry";
import { CivilWar } from "@/models/CivilWar";
import { Match } from "@/models/Match";

// --- Public shapes ---------------------------------------------------------

export type WrappedSuperlative = {
  key: string;
  title: string;
  blurb: string;
  winner: string;
  handle: string;
  avatar: string | null;
  value: string;
  isMe: boolean;
};

export type WrappedPersonal = {
  username: string;
  handle: string;
  avatar: string | null;
  rank: number;
  totalPlayers: number;
  totalPoints: number;
  matches: number;
  missed: number;
  wins: number;
  silver: number;
  bronze: number;
  podiums: number;

  // Fantasy (my11/Dream11) scoring from MatchResult.fantasyPoints
  totalFantasyPoints: number;
  avgFantasyPoints: number;
  bestMatch: { points: number; label: string } | null;
  bestRank: number | null;

  // Predictions
  predictions: {
    total: number;
    correctWinners: number;
    correctBatters: number;
    correctBowlers: number;
    perfects: number;
    accuracy: number; // 0-100 across all three legs
  };

  // Head-to-heads
  rivalry: { wins: number; losses: number; draws: number };
  civilWar: { wins: number; losses: number; draws: number };

  // Misc colour
  favouriteBonus: { label: string; count: number } | null;
  favouriteTeam: { name: string; count: number } | null;

  topCategory: { label: string; points: number } | null;
  percentile: number;
  persona: { title: string; blurb: string };
  crowns: string[];

  /** Signed contributions that sum to `totalPoints` — for the "how it's made"
   * breakdown. Negative entries are penalties. */
  pointsBreakdown: { label: string; emoji: string; points: number }[];
};

export type WrappedTodayMatch = {
  teamA: string;
  teamB: string;
  teamAShort: string;
  teamBShort: string;
  /** Cricket team that won the real match (matchWinner). */
  winner: string | null;
  winnerShort: string | null;
  scoreSummary: string | null;
  label: string;
  startTime: string;
  /** Match stage (League / Qualifier / Final …) so the recap can switch copy
   * — e.g. “won the final” / “Champions” for the title decider. */
  stage: string;
  isFinal: boolean;
};

export type WrappedData = {
  season: string;
  /** The most recently submitted (completed + results entered) match. The
   * recap is anchored to this — i.e. “today’s match” once it’s scored. */
  todayMatch: WrappedTodayMatch | null;
  personal: WrappedPersonal;
  superlatives: WrappedSuperlative[];
  league: {
    players: number;
    matchesScored: number;
    totalPoints: number;
    totalFantasyPoints: number;
    topScore: number;
    highestSingleScore: { points: number; name: string } | null;
  };
};

// --- Helpers ---------------------------------------------------------------

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function pickTop(
  rows: LeaderboardRow[],
  value: (r: LeaderboardRow) => number,
): { row: LeaderboardRow; val: number } | null {
  let best: { row: LeaderboardRow; val: number } | null = null;
  for (const r of rows) {
    const v = value(r);
    if (v <= 0) continue;
    if (!best || v > best.val) best = { row: r, val: v };
  }
  return best;
}

// A readable label for a bonus/penalty `type` string.
function prettyBonus(type: string): string {
  return type.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function personaFor(p: {
  rank: number;
  totalPlayers: number;
  wins: number;
  podiums: number;
  predAccuracy: number;
  rivalryWins: number;
  civilWarWins: number;
  missed: number;
}): { title: string; blurb: string } {
  if (p.rank === 1)
    return {
      title: "The Champion 👑",
      blurb: "Top of the table. Everyone else played for second.",
    };
  if (p.wins >= 3)
    return {
      title: "The Closer 🎯",
      blurb: `${p.wins} match wins — when it mattered, you delivered.`,
    };
  if (p.predAccuracy >= 55)
    return {
      title: "The Oracle 🔮",
      blurb: "You called it before it happened. Predictions are your art.",
    };
  if (p.civilWarWins >= 4)
    return {
      title: "The Warlord ⚔️",
      blurb: "Civil War is where you made your name.",
    };
  if (p.rivalryWins >= 5)
    return {
      title: "The Nemesis 🔥",
      blurb: "You live for the head-to-heads. A true rival.",
    };
  if (p.missed === 0)
    return {
      title: "The Iron Man 🛡️",
      blurb: "Never missed a single match. Show up, score up.",
    };
  if (p.podiums >= 4)
    return {
      title: "Mr. Consistent 📈",
      blurb: "Always lurking on the podium. Reliability is your superpower.",
    };
  if (p.rank > p.totalPlayers * 0.7)
    return {
      title: "The Dark Horse 🐎",
      blurb: "Underrated and dangerous. The comeback arc is loading.",
    };
  return {
    title: "The Contender 🥊",
    blurb: "In the mix all season. The title is within reach.",
  };
}

// --- Main ------------------------------------------------------------------

export async function buildWrappedData(meId: string): Promise<WrappedData> {
  await connectDB();

  const [
    lb,
    matchDocs,
    mrAgg,
    bonusAgg,
    bestMatchAgg,
    predRows,
    rivals,
    civilWars,
    bestSingle,
    latestMatch,
  ] = await Promise.all([
    computeLeaderboard(),
    Match.find({}).select("teamA teamB teamAShort teamBShort").lean(),
    MatchResult.aggregate<{
      _id: unknown;
      totalFantasy: number;
      avgFantasy: number;
      matches: number;
      missed: number;
      bestRank: number | null;
    }>([
      {
        $group: {
          _id: "$userId",
          totalFantasy: { $sum: "$fantasyPoints" },
          avgFantasy: { $avg: "$fantasyPoints" },
          matches: { $sum: 1 },
          missed: { $sum: { $cond: ["$missed", 1, 0] } },
          bestRank: {
            $min: { $cond: [{ $gt: ["$rank", 0] }, "$rank", null] },
          },
        },
      },
    ]),
    MatchResult.aggregate<{
      _id: { userId: unknown; type: string };
      count: number;
    }>([
      { $unwind: "$bonuses" },
      {
        $group: {
          _id: { userId: "$userId", type: "$bonuses.type" },
          count: { $sum: 1 },
        },
      },
    ]),
    MatchResult.aggregate<{
      _id: unknown;
      matchId: unknown;
      fantasyPoints: number;
    }>([
      { $sort: { fantasyPoints: -1 } },
      {
        $group: {
          _id: "$userId",
          matchId: { $first: "$matchId" },
          fantasyPoints: { $first: "$fantasyPoints" },
        },
      },
    ]),
    Prediction.find({ scored: true })
      .select(
        "userId winner correctWinner correctBatter correctBowler allThreeBonus",
      )
      .lean(),
    Rivalry.find({ settled: true })
      .select("challengerId opponentId winnerId")
      .lean(),
    CivilWar.find({ settled: true, result: { $ne: null } })
      .select("members result")
      .lean(),
    MatchResult.findOne({})
      .sort({ fantasyPoints: -1 })
      .select("userId fantasyPoints")
      .lean(),
    Match.findOne({
      status: "completed",
      resultsEntered: true,
      wrappedEnabled: true,
    })
      .sort({ startTime: -1 })
      .select(
        "teamA teamB teamAShort teamBShort matchWinner scoreSummary startTime stage",
      )
      .lean(),
  ]);

  const totalPlayers = lb.length;
  const me = lb.find((r) => String(r.userId) === meId);
  const rowOf = new Map(lb.map((r) => [String(r.userId), r]));
  const nameOf = (uid: string) => rowOf.get(uid)?.username ?? "—";
  const handleOf = (uid: string) => rowOf.get(uid)?.handle ?? "";
  const avatarOf = (uid: string) => rowOf.get(uid)?.avatar ?? null;

  const matchLabel = new Map(
    matchDocs.map((m) => [
      String(m._id),
      `${m.teamAShort ?? m.teamA} v ${m.teamBShort ?? m.teamB}`,
    ]),
  );

  // ---- index aggregates by user ----
  const fantasyByUser = new Map(mrAgg.map((r) => [String(r._id), r]));
  const bestMatchByUser = new Map(
    bestMatchAgg.map((r) => [String(r._id), r]),
  );

  const bonusByUser = new Map<string, { type: string; count: number }>();
  for (const b of bonusAgg) {
    const uid = String((b._id as { userId: unknown }).userId);
    const prev = bonusByUser.get(uid);
    if (!prev || b.count > prev.count)
      bonusByUser.set(uid, {
        type: (b._id as { type: string }).type,
        count: b.count,
      });
  }

  type PredAcc = {
    total: number;
    correctWinners: number;
    correctBatters: number;
    correctBowlers: number;
    perfects: number;
    legsCorrect: number;
    teams: Map<string, number>;
  };
  const predByUser = new Map<string, PredAcc>();
  for (const p of predRows) {
    const uid = String(p.userId);
    let acc = predByUser.get(uid);
    if (!acc) {
      acc = {
        total: 0,
        correctWinners: 0,
        correctBatters: 0,
        correctBowlers: 0,
        perfects: 0,
        legsCorrect: 0,
        teams: new Map(),
      };
      predByUser.set(uid, acc);
    }
    acc.total += 1;
    if (p.correctWinner) {
      acc.correctWinners += 1;
      acc.legsCorrect += 1;
    }
    if (p.correctBatter) {
      acc.correctBatters += 1;
      acc.legsCorrect += 1;
    }
    if (p.correctBowler) {
      acc.correctBowlers += 1;
      acc.legsCorrect += 1;
    }
    if (p.allThreeBonus) acc.perfects += 1;
    if (p.winner) acc.teams.set(p.winner, (acc.teams.get(p.winner) ?? 0) + 1);
  }

  type Record3 = { wins: number; losses: number; draws: number };
  const bump = (
    map: Map<string, Record3>,
    uid: string,
    k: keyof Record3,
  ) => {
    const r = map.get(uid) ?? { wins: 0, losses: 0, draws: 0 };
    r[k] += 1;
    map.set(uid, r);
  };

  const rivalryByUser = new Map<string, Record3>();
  for (const r of rivals) {
    const c = String(r.challengerId);
    const o = String(r.opponentId);
    const w = r.winnerId ? String(r.winnerId) : null;
    if (!w) {
      bump(rivalryByUser, c, "draws");
      bump(rivalryByUser, o, "draws");
    } else {
      const loser = w === c ? o : c;
      bump(rivalryByUser, w, "wins");
      bump(rivalryByUser, loser, "losses");
    }
  }

  const civilWarByUser = new Map<string, Record3>();
  for (const cw of civilWars) {
    const result = cw.result;
    if (!result) continue;
    const outcome = result.outcome ?? "";
    for (const m of cw.members) {
      const uid = String(m.userId);
      if (outcome === "draw" || outcome === "not_eligible") {
        bump(civilWarByUser, uid, "draws");
      } else if (
        (outcome.startsWith("A_") && m.side === "A") ||
        (outcome.startsWith("B_") && m.side === "B")
      ) {
        bump(civilWarByUser, uid, "wins");
      } else {
        bump(civilWarByUser, uid, "losses");
      }
    }
  }

  // ---- Superlatives ----
  const superlatives: WrappedSuperlative[] = [];
  const pushSup = (
    s: Omit<WrappedSuperlative, "isMe" | "winner" | "handle" | "avatar"> & {
      userId: string;
    },
  ) => {
    superlatives.push({
      key: s.key,
      title: s.title,
      blurb: s.blurb,
      value: s.value,
      winner: nameOf(s.userId),
      handle: handleOf(s.userId),
      avatar: avatarOf(s.userId),
      isMe: s.userId === meId,
    });
  };

  const defs: Array<{
    key: string;
    title: string;
    blurb: string;
    value: (r: LeaderboardRow) => number;
    fmtVal: (v: number) => string;
  }> = [
    {
      key: "champion",
      title: "🏆 Overall Champion",
      blurb: "Most total points across the whole season.",
      value: (r) => r.totalPoints,
      fmtVal: (v) => `${fmt(v)} pts`,
    },
    {
      key: "wins",
      title: "🥇 Match King",
      blurb: "Most first-place finishes in individual matches.",
      value: (r) => r.wins,
      fmtVal: (v) => `${v} win${v === 1 ? "" : "s"}`,
    },
    {
      key: "predictor",
      title: "🔮 The Oracle",
      blurb: "Most points earned from match predictions.",
      value: (r) => r.predictionPoints,
      fmtVal: (v) => `${fmt(v)} pts`,
    },
    {
      key: "civilwar",
      title: "⚔️ Civil War Warlord",
      blurb: "Most points won in Civil War team battles.",
      value: (r) => r.civilWarPoints,
      fmtVal: (v) => `${fmt(v)} pts`,
    },
    {
      key: "rivalry",
      title: "🔥 Rivalry Nemesis",
      blurb: "Most points won in head-to-head rivalries.",
      value: (r) => r.rivalryPoints,
      fmtVal: (v) => `${fmt(v)} pts`,
    },
    {
      key: "bonus",
      title: "✨ Bonus Magnet",
      blurb: "Collected the most bonus points all season.",
      value: (r) => r.bonusPoints,
      fmtVal: (v) => `${fmt(v)} pts`,
    },
    {
      key: "bounty",
      title: "🎯 Bounty Hunter",
      blurb: "Cashed in the most bounty rewards.",
      value: (r) => r.bountyPoints,
      fmtVal: (v) => `${fmt(v)} pts`,
    },
  ];
  for (const d of defs) {
    const top = pickTop(lb, d.value);
    if (!top) continue;
    pushSup({
      key: d.key,
      title: d.title,
      blurb: d.blurb,
      value: d.fmtVal(top.val),
      userId: String(top.row.userId),
    });
  }

  // Total fantasy points.
  {
    let best: { uid: string; val: number } | null = null;
    for (const [uid, a] of fantasyByUser)
      if (!best || a.totalFantasy > best.val)
        best = { uid, val: a.totalFantasy };
    if (best && best.val > 0)
      pushSup({
        key: "fantasy_total",
        title: "💰 Fantasy Mogul",
        blurb: "Highest total Dream11 fantasy points all season.",
        value: `${fmt(best.val)} fp`,
        userId: best.uid,
      });
  }

  // Highest single-match fantasy score.
  if (bestSingle)
    pushSup({
      key: "single_high",
      title: "💥 Highest Single Score",
      blurb: "The biggest one-match fantasy haul of the season.",
      value: `${fmt(bestSingle.fantasyPoints)} fp`,
      userId: String(bestSingle.userId),
    });

  // Sharpest predictor (accuracy, min 5 scored predictions).
  {
    let best: { uid: string; acc: number } | null = null;
    for (const [uid, a] of predByUser) {
      if (a.total < 5) continue;
      const acc = (a.legsCorrect / (a.total * 3)) * 100;
      if (!best || acc > best.acc) best = { uid, acc };
    }
    if (best)
      pushSup({
        key: "sharp",
        title: "🎯 Sharpest Eye",
        blurb: "Best prediction accuracy across winner, batter & bowler.",
        value: `${Math.round(best.acc)}%`,
        userId: best.uid,
      });
  }

  // Most perfect prediction rounds.
  {
    let best: { uid: string; n: number } | null = null;
    for (const [uid, a] of predByUser)
      if (!best || a.perfects > best.n) best = { uid, n: a.perfects };
    if (best && best.n > 0)
      pushSup({
        key: "perfects",
        title: "🧠 Crystal Ball",
        blurb: "Most perfect rounds — winner, batter and bowler all right.",
        value: `${best.n}×`,
        userId: best.uid,
      });
  }

  // Rivalry king (most wins).
  {
    let best: { uid: string; w: number } | null = null;
    for (const [uid, r] of rivalryByUser)
      if (!best || r.wins > best.w) best = { uid, w: r.wins };
    if (best && best.w > 0)
      pushSup({
        key: "rivalry_wins",
        title: "🤺 Duel Master",
        blurb: "Won the most one-on-one rivalry battles.",
        value: `${best.w} wins`,
        userId: best.uid,
      });
  }

  // Iron man (most matches played without missing).
  {
    let best: { uid: string; played: number } | null = null;
    for (const [uid, a] of fantasyByUser) {
      const played = a.matches - a.missed;
      if (!best || played > best.played) best = { uid, played };
    }
    if (best)
      pushSup({
        key: "ironman",
        title: "🛡️ The Iron Man",
        blurb: "Showed up for the most matches without missing one.",
        value: `${best.played} played`,
        userId: best.uid,
      });
  }

  // ---- Personal block ----
  const myFantasy = fantasyByUser.get(meId);
  const myBest = bestMatchByUser.get(meId);
  const myPred = predByUser.get(meId);
  const myRivalry = rivalryByUser.get(meId) ?? { wins: 0, losses: 0, draws: 0 };
  const myCivilWar =
    civilWarByUser.get(meId) ?? { wins: 0, losses: 0, draws: 0 };
  const myBonus = bonusByUser.get(meId);

  let favouriteTeam: { name: string; count: number } | null = null;
  if (myPred && myPred.teams.size) {
    for (const [name, count] of myPred.teams)
      if (!favouriteTeam || count > favouriteTeam.count)
        favouriteTeam = { name, count };
  }

  const predAccuracy =
    myPred && myPred.total > 0
      ? Math.round((myPred.legsCorrect / (myPred.total * 3)) * 100)
      : 0;

  let personal: WrappedPersonal;
  if (me) {
    const categories: Array<{ label: string; points: number }> = [
      { label: "League", points: me.leaguePoints },
      { label: "Predictions", points: me.predictionPoints },
      { label: "Civil War", points: me.civilWarPoints },
      { label: "Rivalry", points: me.rivalryPoints },
      { label: "Bonuses", points: me.bonusPoints },
    ];
    const topCategory =
      categories
        .filter((c) => c.points > 0)
        .sort((a, b) => b.points - a.points)[0] ?? null;
    const podiums = me.wins + me.silver + me.bronze;
    const rank = me.position;
    const percentile =
      totalPlayers > 1
        ? Math.round(((totalPlayers - rank) / (totalPlayers - 1)) * 100)
        : 100;
    const crowns = superlatives.filter((s) => s.isMe).map((s) => s.title);

    // Signed breakdown that adds up to `totalPoints` — mirrors the scoring
    // engine's finalPoints (base rank pts + bonuses + bounty + predictions +
    // custom pools + rivalry + civil war + penalties − withdrawals). Note:
    // `penaltyPoints` / `civilWarPoints` are already stored signed.
    const pointsBreakdown = (
      [
        { label: "Match rank points", emoji: "🏏", points: me.basePoints },
        { label: "Bonuses", emoji: "✨", points: me.bonusPoints },
        { label: "Bounty rewards", emoji: "🎯", points: me.bountyPoints },
        { label: "Predictions", emoji: "🔮", points: me.predictionPoints },
        { label: "Custom pools", emoji: "🎱", points: me.customPoolPoints },
        { label: "Rivalry wins", emoji: "🤺", points: me.rivalryPoints },
        { label: "Civil War", emoji: "⚔️", points: me.civilWarPoints },
        { label: "Penalties", emoji: "⛔", points: me.penaltyPoints },
        {
          label: "Rivalry withdrawals",
          emoji: "🏳️",
          points: -me.rivalryWithdrawPenalty,
        },
      ] as { label: string; emoji: string; points: number }[]
    )
      .filter((b) => Math.round(b.points) !== 0)
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .map((b) => ({ ...b, points: Math.round(b.points) }));

    personal = {
      username: me.username,
      handle: me.handle,
      avatar: me.avatar,
      rank,
      totalPlayers,
      totalPoints: Math.round(me.totalPoints),
      matches: myFantasy?.matches ?? me.matches,
      missed: myFantasy?.missed ?? me.missed,
      wins: me.wins,
      silver: me.silver,
      bronze: me.bronze,
      podiums,
      totalFantasyPoints: Math.round(myFantasy?.totalFantasy ?? 0),
      avgFantasyPoints: Math.round(myFantasy?.avgFantasy ?? 0),
      bestMatch: myBest
        ? {
            points: Math.round(myBest.fantasyPoints),
            label: matchLabel.get(String(myBest.matchId)) ?? "a match",
          }
        : null,
      bestRank: myFantasy?.bestRank ?? null,
      predictions: {
        total: myPred?.total ?? 0,
        correctWinners: myPred?.correctWinners ?? 0,
        correctBatters: myPred?.correctBatters ?? 0,
        correctBowlers: myPred?.correctBowlers ?? 0,
        perfects: myPred?.perfects ?? 0,
        accuracy: predAccuracy,
      },
      rivalry: myRivalry,
      civilWar: myCivilWar,
      favouriteBonus: myBonus
        ? { label: prettyBonus(myBonus.type), count: myBonus.count }
        : null,
      favouriteTeam,
      topCategory,
      percentile,
      persona: personaFor({
        rank,
        totalPlayers,
        wins: me.wins,
        podiums,
        predAccuracy,
        rivalryWins: myRivalry.wins,
        civilWarWins: myCivilWar.wins,
        missed: myFantasy?.missed ?? me.missed,
      }),
      crowns,
      pointsBreakdown,
    };
  } else {
    personal = {
      username: "Player",
      handle: "",
      avatar: null,
      rank: totalPlayers,
      totalPlayers,
      totalPoints: 0,
      matches: 0,
      missed: 0,
      wins: 0,
      silver: 0,
      bronze: 0,
      podiums: 0,
      totalFantasyPoints: 0,
      avgFantasyPoints: 0,
      bestMatch: null,
      bestRank: null,
      predictions: {
        total: 0,
        correctWinners: 0,
        correctBatters: 0,
        correctBowlers: 0,
        perfects: 0,
        accuracy: 0,
      },
      rivalry: { wins: 0, losses: 0, draws: 0 },
      civilWar: { wins: 0, losses: 0, draws: 0 },
      favouriteBonus: null,
      favouriteTeam: null,
      topCategory: null,
      percentile: 0,
      persona: {
        title: "The Rookie 🌱",
        blurb: "Your story is just getting started. Time to make some noise.",
      },
      crowns: [],
      pointsBreakdown: [],
    };
  }

  // ---- League totals ----
  const matchesScored = lb.reduce((m, r) => Math.max(m, r.matches), 0);
  const totalPoints = lb.reduce((s, r) => s + Math.max(0, r.totalPoints), 0);
  const topScore = lb.length ? Math.round(lb[0].totalPoints) : 0;
  let leagueFantasy = 0;
  for (const a of fantasyByUser.values()) leagueFantasy += a.totalFantasy;

  // ---- Today's (latest submitted) match ----
  const todayMatch: WrappedTodayMatch | null = latestMatch
    ? {
        teamA: latestMatch.teamA,
        teamB: latestMatch.teamB,
        teamAShort: latestMatch.teamAShort ?? latestMatch.teamA,
        teamBShort: latestMatch.teamBShort ?? latestMatch.teamB,
        winner: latestMatch.matchWinner ?? null,
        winnerShort:
          latestMatch.matchWinner === latestMatch.teamA
            ? (latestMatch.teamAShort ?? latestMatch.teamA)
            : latestMatch.matchWinner === latestMatch.teamB
              ? (latestMatch.teamBShort ?? latestMatch.teamB)
              : (latestMatch.matchWinner ?? null),
        scoreSummary: latestMatch.scoreSummary ?? null,
        label: `${latestMatch.teamAShort ?? latestMatch.teamA} v ${
          latestMatch.teamBShort ?? latestMatch.teamB
        }`,
        startTime: new Date(latestMatch.startTime).toISOString(),
        stage: latestMatch.stage ?? "League",
        isFinal: latestMatch.stage === "Final",
      }
    : null;

  return {
    season: "Season 2026",
    todayMatch,
    personal,
    superlatives,
    league: {
      players: totalPlayers,
      matchesScored,
      totalPoints: Math.round(totalPoints),
      totalFantasyPoints: Math.round(leagueFantasy),
      topScore,
      highestSingleScore: bestSingle
        ? {
            points: Math.round(bestSingle.fantasyPoints),
            name: nameOf(String(bestSingle.userId)),
          }
        : null,
    },
  };
}
