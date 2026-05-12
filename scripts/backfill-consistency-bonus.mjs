#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function getMongoUri() {
  const uriArg = process.argv.find((arg) => arg.startsWith("--uri="));
  if (uriArg) return uriArg.slice("--uri=".length);
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const cwd = process.cwd();
  const merged = {
    ...readEnvFile(path.join(cwd, ".env")),
    ...readEnvFile(path.join(cwd, ".env.local")),
  };
  return merged.MONGODB_URI;
}

// Old consistency awarded 7 (chaos 14). New rule is 4 (chaos 8).
function newConsistencyPoints(oldPoints) {
  if (typeof oldPoints !== "number" || !Number.isFinite(oldPoints) || oldPoints <= 0) {
    return oldPoints;
  }
  return Math.round((oldPoints * 4) / 7);
}

const ADJUSTMENT_TYPE = "consistency_adjustment_v2";
const ADJUSTMENT_REASON =
  "Consistency bonus updated from +7 to +4 per new rules — totals corrected, original entry preserved";

async function main() {
  const dryRun = !process.argv.includes("--apply");
  const uri = getMongoUri();
  if (!uri) {
    console.error("Missing MONGODB_URI. Set env var or add it to .env.local");
    process.exit(1);
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  const db = mongoose.connection.db;
  const matchResults = db.collection("matchresults");
  const bonusAuditLogs = db.collection("bonusauditlogs");

  const candidates = await matchResults
    .find({ "bonuses.type": "consistency" })
    .toArray();

  let scanned = 0;
  let changedMatchResults = 0;
  let appendedBreakdownRows = 0;
  let appendedAuditRows = 0;

  for (const doc of candidates) {
    scanned += 1;
    const bonuses = Array.isArray(doc.bonuses) ? doc.bonuses : [];
    const alreadyAdjusted = bonuses.some((b) => b && b.type === ADJUSTMENT_TYPE);
    if (alreadyAdjusted) continue;

    let delta = 0;
    let originalSum = 0;
    for (const b of bonuses) {
      if (!b || b.type !== "consistency") continue;
      const before = Number(b.points) || 0;
      const after = newConsistencyPoints(before);
      delta += after - before;
      originalSum += before;
    }
    if (delta === 0) continue;

    const adjustmentRow = {
      type: ADJUSTMENT_TYPE,
      points: delta, // negative
      reason: `${ADJUSTMENT_REASON} (was +${originalSum}, now +${originalSum + delta})`,
    };

    const prevBonusPoints = Number(doc.bonusPoints ?? 0);
    const nextBonusPoints = prevBonusPoints + delta;
    const basePoints = Number(doc.basePoints ?? 0);
    const penaltyPoints = Number(doc.penaltyPoints ?? 0);
    const bountyPoints = Number(doc.bountyPoints ?? 0);
    const rivalryPoints = Number(doc.rivalryPoints ?? 0);
    const nextFinalPoints =
      basePoints + penaltyPoints + nextBonusPoints + bountyPoints + rivalryPoints;

    if (!dryRun) {
      await matchResults.updateOne(
        { _id: doc._id },
        {
          $push: { bonuses: adjustmentRow },
          $set: {
            bonusPoints: nextBonusPoints,
            finalPoints: nextFinalPoints,
            updatedAt: new Date(),
          },
        }
      );

      await bonusAuditLogs.insertOne({
        userId: doc.userId,
        matchId: doc.matchId,
        bonusType: ADJUSTMENT_TYPE,
        points: delta,
        explanation: adjustmentRow.reason,
        createdAt: new Date(),
      });
    }

    changedMatchResults += 1;
    appendedBreakdownRows += 1;
    appendedAuditRows += 1;
  }

  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`MatchResult docs scanned with old consistency rows: ${scanned}`);
  console.log(`MatchResult docs adjusted: ${changedMatchResults}`);
  console.log(`Adjustment breakdown rows appended: ${appendedBreakdownRows}`);
  console.log(`BonusAuditLog adjustment rows appended: ${appendedAuditRows}`);
  console.log("Original history entries were NOT modified.");
  if (dryRun) {
    console.log("No database writes were made. Re-run with --apply to persist.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err?.message ?? err);
  const msg = String(err?.message ?? "");
  const reason = String(err?.reason?.type ?? "");
  if (
    err?.name === "MongooseServerSelectionError" ||
    reason === "ReplicaSetNoPrimary" ||
    /whitelist|timed out|ENOTFOUND|ECONNREFUSED|ReplicaSetNoPrimary/i.test(msg)
  ) {
    console.error("\nLikely connectivity issue (not script logic). Try:");
    console.error("1) Atlas Network Access: add your current IP or temporarily 0.0.0.0/0.");
    console.error("2) Verify DB user/password in MONGODB_URI.");
    console.error("3) Override URI: node scripts/backfill-consistency-bonus.mjs --uri='mongodb+srv://...'");
  }
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
