import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import {
  fetchLeaderboardFromContestUrl,
  My11AuthError,
  My11NotReadyError,
} from "@/lib/my11-api";
import { normalizeMy11circleName } from "@/lib/my11circle";

export type My11NameVerifyResult =
  | {
      ok: true;
      matched: true;
      sample: {
        teamA: string;
        teamB: string;
        score: number;
        rank: number | null;
      };
    }
  | { ok: true; matched: false }
  | {
      ok: false;
      reason:
        | "no_recent_match"
        | "auth_expired"
        | "my11_not_ready"
        | "fetch_failed";
      message?: string;
    };

/**
 * Verify a candidate my11 name by checking the most recent completed match's
 * contest leaderboard for that exact (normalized) username with score > 0.
 *
 * Tries up to the 3 most recent completed matches with a contestUrl so a
 * single bad/unavailable contest doesn't fail the whole check.
 */
export async function verifyMy11NameAgainstRecentMatches(
  candidate: string
): Promise<My11NameVerifyResult> {
  const target = normalizeMy11circleName(candidate);
  if (!target) return { ok: true, matched: false };

  await connectDB();
  const matches = await Match.find({
    status: "completed",
    contestUrl: { $exists: true, $ne: "" },
  })
    .sort({ startTime: -1 })
    .limit(3)
    .lean();

  if (matches.length === 0) return { ok: false, reason: "no_recent_match" };

  let lastErr: My11NameVerifyResult | null = null;
  for (const m of matches) {
    if (!m.contestUrl) continue;
    try {
      const lb = await fetchLeaderboardFromContestUrl(m.contestUrl);
      const hit = lb.entries.find(
        (row) =>
          normalizeMy11circleName(row.username) === target &&
          (row.totalScore ?? 0) > 0
      );
      if (hit) {
        return {
          ok: true,
          matched: true,
          sample: {
            teamA: m.teamA,
            teamB: m.teamB,
            score: hit.totalScore,
            rank: hit.rank,
          },
        };
      }
    } catch (err) {
      if (err instanceof My11AuthError) {
        lastErr = { ok: false, reason: "auth_expired" };
        break;
      }
      if (err instanceof My11NotReadyError) {
        lastErr = { ok: false, reason: "my11_not_ready" };
        continue;
      }
      lastErr = {
        ok: false,
        reason: "fetch_failed",
        message: err instanceof Error ? err.message : "Failed",
      };
    }
  }

  if (lastErr) return lastErr;
  return { ok: true, matched: false };
}
