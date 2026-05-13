#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const PRED = {
  WINNER: 3,
  TOP_BATTER: 4,
  TOP_BOWLER: 4,
  ALL_THREE_BONUS: 1,
};

const BOUNTY_AUDIT_TYPES = new Set(["bounty_match"]);
const RIVALRY_AUDIT_TYPES = new Set(["rivalry_win", "rivalry_revenge_win"]);

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function getArg(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}

function getMongoUri() {
  const arg = getArg("--uri");
  if (arg) return arg;
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const cwd = process.cwd();
  const merged = {
    ...readEnvFile(path.join(cwd, ".env")),
    ...readEnvFile(path.join(cwd, ".env.local")),
  };
  return merged.MONGODB_URI;
}

function sumPoints(items) {
  if (!Array.isArray(items)) return 0;
  let total = 0;
  for (const item of items) total += Number(item?.points ?? 0);
  return total;
}

function predictionExpectedFromFlags(pred) {
  if (pred.correctWinner === undefined || pred.correctBatter === undefined || pred.correctBowler === undefined) {
    return null;
  }
  let pts = 0;
  if (pred.correctWinner) pts += PRED.WINNER;
  if (pred.correctBatter) pts += PRED.TOP_BATTER;
  if (pred.correctBowler) pts += PRED.TOP_BOWLER;
  if (pred.correctWinner && pred.correctBatter && pred.correctBowler) pts += PRED.ALL_THREE_BONUS;
  return pts;
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error("Missing MONGODB_URI (pass --uri=... or set it in .env.local)");
    process.exit(1);
  }

  const outPath = getArg("--out");
  const sampleSize = Number(getArg("--sample") ?? 200);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const matchResults = db.collection("matchresults");
  const predictions = db.collection("predictions");
  const bonusAuditLogs = db.collection("bonusauditlogs");

  const bonusAuditRows = await bonusAuditLogs
    .find({}, { projection: { userId: 1, matchId: 1, bonusType: 1, points: 1 } })
    .toArray();

  const bonusAuditMap = new Map();
  for (const row of bonusAuditRows) {
    const k = `${String(row.userId)}::${String(row.matchId)}`;
    const cur = bonusAuditMap.get(k) ?? {
      bonusOnlyPoints: 0,
      bountyPoints: 0,
      rivalryPoints: 0,
      totalPoints: 0,
      count: 0,
    };
    const pts = Number(row.points ?? 0);
    const t = String(row.bonusType ?? "");
    if (BOUNTY_AUDIT_TYPES.has(t)) cur.bountyPoints += pts;
    else if (RIVALRY_AUDIT_TYPES.has(t)) cur.rivalryPoints += pts;
    else cur.bonusOnlyPoints += pts;
    cur.totalPoints += pts;
    cur.count += 1;
    bonusAuditMap.set(k, cur);
  }

  const summary = {
    matchResultsScanned: 0,
    mismatchedBonusPoints: 0,
    mismatchedBountyPointsVsAudit: 0,
    mismatchedRivalryPointsVsAudit: 0,
    mismatchedPenaltyPoints: 0,
    mismatchedFinalPoints: 0,
    mismatchedBonusOnlyAuditVsBreakdown: 0,
    predictionScoredRowsScanned: 0,
    predictionFlagFormulaMismatches: 0,
  };

  const samples = {
    matchResultMismatches: [],
    predictionMismatches: [],
  };

  const cursor = matchResults.find({}, {
    projection: {
      userId: 1,
      matchId: 1,
      basePoints: 1,
      bonusPoints: 1,
      penaltyPoints: 1,
      bountyPoints: 1,
      rivalryPoints: 1,
      civilWarPoints: 1,
      finalPoints: 1,
      bonuses: 1,
      penalties: 1,
    },
  });

  for await (const doc of cursor) {
    summary.matchResultsScanned += 1;

    const bonusFromRows = sumPoints(doc.bonuses);
    const penaltyFromRows = sumPoints(doc.penalties);

    const storedBounty = Number(doc.bountyPoints ?? 0);
    const storedRivalry = Number(doc.rivalryPoints ?? 0);
    const storedBonus = Number(doc.bonusPoints ?? 0);
    const storedPenalty = Number(doc.penaltyPoints ?? 0);
    const storedFinal = Number(doc.finalPoints ?? 0);

    const key = `${String(doc.userId)}::${String(doc.matchId)}`;
    const log = bonusAuditMap.get(key);
    const bonusAuditPoints = Number(log?.bonusOnlyPoints ?? 0);
    const bountyAuditPoints = Number(log?.bountyPoints ?? 0);
    const rivalryAuditPoints = Number(log?.rivalryPoints ?? 0);

    const expectedBonus = bonusFromRows;
    const expectedPenalty = penaltyFromRows;
    const expectedBounty = log ? bountyAuditPoints : storedBounty;
    const expectedRivalry = log ? rivalryAuditPoints : storedRivalry;

    const expectedFinal =
      Number(doc.basePoints ?? 0) +
      expectedBonus +
      expectedPenalty +
      expectedBounty +
      expectedRivalry +
      Number(doc.civilWarPoints ?? 0);

    const mismatch = {
      bonus: storedBonus !== bonusFromRows,
      bountyAudit: log ? storedBounty !== bountyAuditPoints : false,
      rivalryAudit: log ? storedRivalry !== rivalryAuditPoints : false,
      penalty: storedPenalty !== penaltyFromRows,
      final: storedFinal !== expectedFinal,
      bonusAudit: log ? bonusAuditPoints !== bonusFromRows : false,
    };

    if (mismatch.bonus) summary.mismatchedBonusPoints += 1;
    if (mismatch.bountyAudit) summary.mismatchedBountyPointsVsAudit += 1;
    if (mismatch.rivalryAudit) summary.mismatchedRivalryPointsVsAudit += 1;
    if (mismatch.penalty) summary.mismatchedPenaltyPoints += 1;
    if (mismatch.final) summary.mismatchedFinalPoints += 1;
    if (mismatch.bonusAudit) summary.mismatchedBonusOnlyAuditVsBreakdown += 1;

    if ((mismatch.bonus || mismatch.penalty || mismatch.final || mismatch.bonusAudit || mismatch.bountyAudit || mismatch.rivalryAudit) && samples.matchResultMismatches.length < sampleSize) {
      samples.matchResultMismatches.push({
        matchResultId: String(doc._id),
        userId: String(doc.userId),
        matchId: String(doc.matchId),
        stored: {
          bonusPoints: storedBonus,
          bountyPoints: storedBounty,
          rivalryPoints: storedRivalry,
          penaltyPoints: storedPenalty,
          finalPoints: storedFinal,
        },
        expected: {
          bonusPoints: expectedBonus,
          bountyPoints: expectedBounty,
          rivalryPoints: expectedRivalry,
          penaltyPoints: expectedPenalty,
          finalPoints: expectedFinal,
        },
        bonusAudit: {
          bonusOnlyPoints: bonusAuditPoints,
          bountyPoints: bountyAuditPoints,
          rivalryPoints: rivalryAuditPoints,
          totalPoints: Number(log?.totalPoints ?? 0),
          count: Number(log?.count ?? 0),
        },
      });
    }
  }

  const predCursor = predictions.find(
    { scored: true },
    {
      projection: {
        userId: 1,
        matchId: 1,
        scored: 1,
        pointsAwarded: 1,
        correctWinner: 1,
        correctBatter: 1,
        correctBowler: 1,
      },
    }
  );

  for await (const p of predCursor) {
    summary.predictionScoredRowsScanned += 1;
    const expected = predictionExpectedFromFlags(p);
    if (expected === null) continue;
    const stored = Number(p.pointsAwarded ?? 0);
    if (stored !== expected) {
      summary.predictionFlagFormulaMismatches += 1;
      if (samples.predictionMismatches.length < sampleSize) {
        samples.predictionMismatches.push({
          predictionId: String(p._id),
          userId: String(p.userId),
          matchId: String(p.matchId),
          storedPointsAwarded: stored,
          expectedPointsAwarded: expected,
          flags: {
            correctWinner: !!p.correctWinner,
            correctBatter: !!p.correctBatter,
            correctBowler: !!p.correctBowler,
          },
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    samples,
  };

  console.log(JSON.stringify(report.summary, null, 2));
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Detailed report written: ${outPath}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Audit failed:", err?.message ?? err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
