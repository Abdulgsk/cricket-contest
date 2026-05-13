import mongoose from "mongoose";
import { CivilWar } from "@/models/CivilWar";

export const CIVIL_WAR_OUTCOME_LABEL: Record<string, string> = {
  A_decisive: "Decisive",
  B_decisive: "Decisive",
  A_split: "Split",
  B_split: "Split",
  A_fp_tiebreak: "FP tiebreak",
  B_fp_tiebreak: "FP tiebreak",
  A_won_clear: "Clear win",
  B_won_clear: "Clear win",
  draw: "Draw",
  not_eligible: "Not eligible",
};

export type CivilWarRowBreakdown = {
  outcome: string;
  outcomeLabel: string;
  result: "win" | "loss" | "draw" | "neutral";
  base: number; // per-member team points (without captain bonus)
  captainBonus: number; // captain duel bonus the user actually received
};

/**
 * Build a per-match civil-war breakdown for one user, splitting the
 * persisted `civilWarPoints` into `base` (team outcome) and `captainBonus`
 * (extra +N if the user's side won the captain duel).
 */
export async function loadCivilWarBreakdowns(
  userId: string,
  matchIds: string[]
): Promise<Map<string, CivilWarRowBreakdown>> {
  const out = new Map<string, CivilWarRowBreakdown>();
  if (!matchIds.length) return out;

  const objIds = matchIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!objIds.length) return out;

  const cws = await CivilWar.find({
    matchId: { $in: objIds },
    settled: true,
    "members.userId": new mongoose.Types.ObjectId(userId),
  }).lean();

  for (const cw of cws) {
    if (!cw.result) continue;
    const myMember = cw.members.find((m) => String(m.userId) === userId);
    if (!myMember) continue;
    const mySide = myMember.side;
    const base =
      (mySide === "A"
        ? cw.result.teamAPointsPerMember
        : cw.result.teamBPointsPerMember) ?? 0;
    const captainBonus =
      cw.result.captainWinnerSide === mySide
        ? cw.result.captainBonusPerMember ?? 0
        : 0;
    const outcome = cw.result.outcome ?? "";
    let result: CivilWarRowBreakdown["result"] = "neutral";
    if (outcome === "draw") result = "draw";
    else if (outcome === "not_eligible") result = "neutral";
    else {
      const winnerIsA = outcome.startsWith("A_");
      result = winnerIsA === (mySide === "A") ? "win" : "loss";
    }
    out.set(String(cw.matchId), {
      outcome,
      outcomeLabel: CIVIL_WAR_OUTCOME_LABEL[outcome] ?? outcome,
      result,
      base,
      captainBonus,
    });
  }
  return out;
}
