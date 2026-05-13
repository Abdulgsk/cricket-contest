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

function hasFlag(name) {
  return process.argv.includes(name);
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
  const dryRun = !hasFlag("--apply");
  const fixPredictions = hasFlag("--fix-predictions");
  const uri = getMongoUri();
  if (!uri) {
    console.error("Missing MONGODB_URI (pass --uri=... or set it in .env.local)");
    process.exit(1);
  }

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
      count: 0,
    };
    const pts = Number(row.points ?? 0);
    const t = String(row.bonusType ?? "");
    if (BOUNTY_AUDIT_TYPES.has(t)) cur.bountyPoints += pts;
    else if (RIVALRY_AUDIT_TYPES.has(t)) cur.rivalryPoints += pts;
    else cur.bonusOnlyPoints += pts;
    cur.count += 1;
    bonusAuditMap.set(k, cur);
  }

  const counters = {
    mode: dryRun ? "DRY_RUN" : "APPLY",
    matchResultsScanned: 0,
    matchResultsUpdated: 0,
    bonusPointsFixed: 0,
    penaltyPointsFixed: 0,
    finalPointsFixed: 0,
    predictionRowsScanned: 0,
    predictionRowsUpdated: 0,
    bountyPointsFixed: 0,
    rivalryPointsFixed: 0,
  };

  const cursor = matchResults.find({}, {
    projection: {
      basePoints: 1,
      bonusPoints: 1,
      bountyPoints: 1,
      rivalryPoints: 1,
      civilWarPoints: 1,
      penaltyPoints: 1,
      finalPoints: 1,
      bonuses: 1,
      penalties: 1,
      updatedAt: 1,
    },
  });

  for await (const doc of cursor) {
    counters.matchResultsScanned += 1;

    const expectedBonus = sumPoints(doc.bonuses);
    const expectedPenalty = sumPoints(doc.penalties);
    const key = `${String(doc.userId)}::${String(doc.matchId)}`;
    const bonusAudit = bonusAuditMap.get(key);
    const expectedBounty = bonusAudit ? Number(bonusAudit.bountyPoints ?? 0) : Number(doc.bountyPoints ?? 0);
    const expectedRivalry = bonusAudit ? Number(bonusAudit.rivalryPoints ?? 0) : Number(doc.rivalryPoints ?? 0);
    const expectedFinal =
      Number(doc.basePoints ?? 0) +
      expectedBonus +
      expectedPenalty +
      expectedBounty +
      expectedRivalry +
      Number(doc.civilWarPoints ?? 0);

    const storedBonus = Number(doc.bonusPoints ?? 0);
    const storedPenalty = Number(doc.penaltyPoints ?? 0);
    const storedBounty = Number(doc.bountyPoints ?? 0);
    const storedRivalry = Number(doc.rivalryPoints ?? 0);
    const storedFinal = Number(doc.finalPoints ?? 0);

    const set = {};
    if (storedBonus !== expectedBonus) {
      set.bonusPoints = expectedBonus;
      counters.bonusPointsFixed += 1;
    }
    if (storedPenalty !== expectedPenalty) {
      set.penaltyPoints = expectedPenalty;
      counters.penaltyPointsFixed += 1;
    }
    if (storedBounty !== expectedBounty) {
      set.bountyPoints = expectedBounty;
      counters.bountyPointsFixed += 1;
    }
    if (storedRivalry !== expectedRivalry) {
      set.rivalryPoints = expectedRivalry;
      counters.rivalryPointsFixed += 1;
    }
    if (storedFinal !== expectedFinal) {
      set.finalPoints = expectedFinal;
      counters.finalPointsFixed += 1;
    }

    if (Object.keys(set).length > 0) {
      counters.matchResultsUpdated += 1;
      if (!dryRun) {
        set.updatedAt = new Date();
        await matchResults.updateOne({ _id: doc._id }, { $set: set });
      }
    }
  }

  if (fixPredictions) {
    const predCursor = predictions.find(
      { scored: true },
      {
        projection: {
          pointsAwarded: 1,
          correctWinner: 1,
          correctBatter: 1,
          correctBowler: 1,
          updatedAt: 1,
        },
      }
    );

    for await (const pred of predCursor) {
      counters.predictionRowsScanned += 1;
      const expected = predictionExpectedFromFlags(pred);
      if (expected === null) continue;
      const stored = Number(pred.pointsAwarded ?? 0);
      if (stored === expected) continue;

      counters.predictionRowsUpdated += 1;
      if (!dryRun) {
        await predictions.updateOne(
          { _id: pred._id },
          { $set: { pointsAwarded: expected, updatedAt: new Date() } }
        );
      }
    }
  }

  console.log(JSON.stringify(counters, null, 2));
  if (dryRun) {
    console.log("No writes were made. Re-run with --apply to persist fixes.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Fix script failed:", err?.message ?? err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
