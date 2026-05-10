import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { MatchResult } from "@/models/MatchResult";
import { Prediction } from "@/models/Prediction";
import { DailyFact } from "@/models/DailyFact";
import { User } from "@/models/User";
import { computeLeaderboard, type LeaderboardRow } from "@/services/scoring";
import { ordinal } from "@/lib/utils";

interface Fact {
  text: string;
  type: string;
  score: number;
  userId?: string;
}

/**
 * Generate narrative storyline facts for a just-scored match and persist them.
 * Called automatically from processMatchResults() once results are entered.
 */
export async function generateFactsForMatch(matchId: string): Promise<Fact[]> {
  await connectDB();
  const match = await Match.findById(matchId).lean();
  if (!match) return [];

  // Snapshot leaderboards before & after this match
  const [prevLb, currLb] = await Promise.all([
    computeLeaderboard({ excludeMatchId: matchId }),
    computeLeaderboard(),
  ]);
  const prevMap = new Map(prevLb.map((r) => [String(r.userId), r]));
  const currMap = new Map(currLb.map((r) => [String(r.userId), r]));

  const results = await MatchResult.find({ matchId }).lean();
  const userIds = results.map((r) => String(r.userId));
  const users = await User.find({ _id: { $in: userIds } })
    .select("username userId")
    .lean();
  const nameMap = new Map(users.map((u) => [String(u._id), u.username]));

  const ranked = results
    .filter((r) => !r.missed && r.rank > 0)
    .sort((a, b) => a.rank - b.rank);
  const top1 = ranked[0];
  const top2 = ranked[1];

  const facts: Fact[] = [];

  // ---- Match domination story ----
  if (top1 && top2) {
    const gap = top1.fantasyPoints - top2.fantasyPoints;
    const winnerName = nameMap.get(String(top1.userId));
    const winnerPrev = prevMap.get(String(top1.userId));
    const winnerCurr = currMap.get(String(top1.userId));
    if (winnerName && gap >= 300) {
      const positionStory =
        winnerPrev && winnerCurr && winnerCurr.position < winnerPrev.position
          ? ` That domination pushed ${winnerName} from ${ordinal(winnerPrev.position)} to ${ordinal(winnerCurr.position)} on the leaderboard.`
          : winnerCurr
            ? ` ${winnerName} now sits at ${ordinal(winnerCurr.position)} overall.`
            : "";
      facts.push({
        text: `${winnerName} dominated tonight with a ${gap}-point Dream11 win over ${nameMap.get(String(top2.userId)) ?? "the runner-up"}.${positionStory}`,
        type: "domination",
        score: 90 + Math.min(gap - 300, 200) / 10,
        userId: String(top1.userId),
      });
    } else if (winnerName && gap <= 20) {
      facts.push({
        text: `Tightest finish in a while — ${winnerName} edged out ${nameMap.get(String(top2.userId)) ?? "the chaser"} by just ${gap} Dream11 points.`,
        type: "close_finish",
        score: 60,
        userId: String(top1.userId),
      });
    }
  }

  // ---- Biggest leaderboard climb ----
  let biggestClimb: { userId: string; from: number; to: number; delta: number } | null = null;
  let biggestDrop: { userId: string; from: number; to: number; delta: number } | null = null;
  for (const uid of userIds) {
    const prev = prevMap.get(uid);
    const curr = currMap.get(uid);
    if (!prev || !curr) continue;
    const delta = prev.position - curr.position; // positive = climbed
    if (delta >= 2 && (!biggestClimb || delta > biggestClimb.delta)) {
      biggestClimb = { userId: uid, from: prev.position, to: curr.position, delta };
    }
    if (delta <= -2 && (!biggestDrop || delta < biggestDrop.delta)) {
      biggestDrop = { userId: uid, from: prev.position, to: curr.position, delta };
    }
  }
  if (biggestClimb) {
    const name = nameMap.get(biggestClimb.userId);
    if (name) {
      facts.push({
        text: `${name} jumped ${biggestClimb.delta} spot${biggestClimb.delta > 1 ? "s" : ""}, climbing from ${ordinal(biggestClimb.from)} to ${ordinal(biggestClimb.to)} after this match.`,
        type: "climb",
        score: 70 + biggestClimb.delta * 3,
        userId: biggestClimb.userId,
      });
    }
  }
  if (biggestDrop) {
    const name = nameMap.get(biggestDrop.userId);
    if (name) {
      facts.push({
        text: `${name} slipped ${Math.abs(biggestDrop.delta)} place${Math.abs(biggestDrop.delta) > 1 ? "s" : ""}, sliding from ${ordinal(biggestDrop.from)} to ${ordinal(biggestDrop.to)} overall.`,
        type: "slip",
        score: 55 + Math.abs(biggestDrop.delta) * 2,
        userId: biggestDrop.userId,
      });
    }
  }

  // ---- Streaks: consecutive Top 5 / consecutive missed ----
  for (const r of results) {
    const name = nameMap.get(String(r.userId));
    if (!name) continue;
    const recent = await MatchResult.find({ userId: r.userId })
      .populate({ path: "matchId", select: "startTime", model: Match })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();
    const ordered = recent
      .filter((x) => x.matchId)
      .sort((a, b) => {
        const ad = (a.matchId as unknown as { startTime: Date }).startTime.getTime();
        const bd = (b.matchId as unknown as { startTime: Date }).startTime.getTime();
        return bd - ad;
      });
    let top5Streak = 0;
    for (const x of ordered) {
      if (!x.missed && x.rank > 0 && x.rank <= 5) top5Streak++;
      else break;
    }
    if (top5Streak >= 3) {
      const curr = currMap.get(String(r.userId));
      facts.push({
        text: `${name} has finished Top 5 in ${top5Streak} matches in a row${curr ? ` — that consistency is what put them at ${ordinal(curr.position)} overall` : ""}.`,
        type: "streak_top5",
        score: 65 + top5Streak * 4,
        userId: String(r.userId),
      });
    }
    let missStreak = 0;
    for (const x of ordered) {
      if (x.missed) missStreak++;
      else break;
    }
    if (missStreak >= 2) {
      facts.push({
        text: `${name} has now missed ${missStreak} matches in a row — the consecutive-miss penalty is biting hard.`,
        type: "streak_miss",
        score: 40 + missStreak * 5,
        userId: String(r.userId),
      });
    }
  }

  // ---- Highest single-match bonus / "but for the bonus" story ----
  const bonusLeader = [...results].sort((a, b) => b.bonusPoints - a.bonusPoints)[0];
  if (bonusLeader && bonusLeader.bonusPoints > 0) {
    const name = nameMap.get(String(bonusLeader.userId));
    const reasons = (bonusLeader.bonuses ?? [])
      .filter((b) => b.points > 0 && b.type !== "cap_applied")
      .map((b) => b.type.replace(/_/g, " "))
      .join(" + ");
    if (name) {
      facts.push({
        text: `${name} bagged the biggest bonus haul this match (+${bonusLeader.bonusPoints})${reasons ? ` — ${reasons}` : ""}.`,
        type: "bonus_king",
        score: 60 + bonusLeader.bonusPoints,
        userId: String(bonusLeader.userId),
      });
    }
  }

  // ---- Prediction perfection ----
  const preds = await Prediction.find({ matchId, scored: true }).lean();
  for (const p of preds) {
    if (p.allThreeBonus) {
      const name = nameMap.get(String(p.userId));
      if (name) {
        facts.push({
          text: `${name} nailed all three predictions and pocketed +${p.pointsAwarded} — a perfect round.`,
          type: "prediction_perfect",
          score: 75,
          userId: String(p.userId),
        });
      }
    }
  }
  const correctWinners = preds.filter((p) => p.correctWinner).length;
  if (preds.length && correctWinners === 0) {
    facts.push({
      text: `Not a single correct winner prediction tonight — everyone left points on the table.`,
      type: "prediction_blank",
      score: 50,
    });
  }

  // ---- Bounty story ----
  if (match.bountyUserId) {
    const bountyId = String(match.bountyUserId);
    const bountyRes = results.find((r) => String(r.userId) === bountyId);
    const bountyName = nameMap.get(bountyId);
    if (bountyName && bountyRes) {
      const beaters = ranked.filter((r) => r.rank < bountyRes.rank).length;
      if (beaters === 0) {
        facts.push({
          text: `${bountyName} survived the bounty target — no one beat them this match.`,
          type: "bounty_safe",
          score: 60,
          userId: bountyId,
        });
      } else if (beaters >= 5) {
        facts.push({
          text: `${beaters} players beat ${bountyName} for the bounty this match — a +${beaters * 3} payout across the field.`,
          type: "bounty_open",
          score: 55,
          userId: bountyId,
        });
      }
    }
  }

  // ---- New leader / leadership change ----
  const prevLeader = prevLb[0];
  const currLeader = currLb[0];
  if (
    prevLeader &&
    currLeader &&
    String(prevLeader.userId) !== String(currLeader.userId)
  ) {
    const name = nameMap.get(String(currLeader.userId)) ?? currLeader.username;
    const oldName = nameMap.get(String(prevLeader.userId)) ?? prevLeader.username;
    facts.push({
      text: `New #1: ${name} has taken over the top spot from ${oldName}.`,
      type: "leader_change",
      score: 95,
      userId: String(currLeader.userId),
    });
  }

  // Persist (replace any existing facts for this match so re-entry refreshes them)
  await DailyFact.deleteMany({ matchId });
  if (facts.length) {
    await DailyFact.insertMany(
      facts.map((f) => ({
        matchId,
        text: f.text,
        type: f.type,
        score: f.score,
        userId: f.userId,
      }))
    );
  }
  return facts;
}

/** All facts for the most recently scored match, highest-interest first. */
export async function getLatestFacts(limit?: number) {
  await connectDB();
  const latest = await DailyFact.findOne().sort({ createdAt: -1 }).lean();
  if (!latest) return [];
  const q = DailyFact.find({ matchId: latest.matchId }).sort({
    score: -1,
    createdAt: -1,
  });
  if (limit && limit > 0) q.limit(limit);
  return q.lean();
}

interface LeaderboardSnapshot {
  prev: LeaderboardRow | undefined;
  curr: LeaderboardRow | undefined;
}
// (kept for future use / typing reference)
export type { LeaderboardSnapshot };
