#!/usr/bin/env node
// One-shot migration: grant the new `dev.member` feature to any user (or
// custom role) that holds the retired `bugs.view` or `dev.workitems.view`
// features. Idempotent.
//
// Usage:
//   node scripts/migrate-dev-member.mjs --dry      # print diff, no writes
//   node scripts/migrate-dev-member.mjs --apply    # write changes

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const DRY = process.argv.includes("--dry") || !APPLY;

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const eq = t.indexOf("=");
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const envLocal = readEnvFile(path.resolve(".env.local"));
const env = readEnvFile(path.resolve(".env"));
const MONGODB_URI = process.env.MONGODB_URI || envLocal.MONGODB_URI || env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set (env or .env.local)");
  process.exit(1);
}

// Bit positions must match lib/features.ts FEATURE_DEFS order.
const FEATURE_KEYS = [
  "matches.manage",
  "match.lock.extend",
  "results.manage",
  "bonus.manage",
  "civilwar.points.manage",
  "users.manage",
  "users.roles.assign",
  "users.delete",
  "rivalry.withdraw.approve",
  "audit.view",
  "automation.run",
  "facts.regenerate",
  "bugs.view",
  "bugs.manage",
  "match.bounty.manage",
  "dev.workitems.view",
  "dev.workitems.manage",
  "dev.diagnostics.view",
  "dev.member",
];
const BIT = Object.fromEntries(FEATURE_KEYS.map((k, i) => [k, i]));

function bitmapHas(str, key) {
  if (!str) return false;
  try {
    const m = BigInt(str);
    return (m & (1n << BigInt(BIT[key]))) !== 0n;
  } catch {
    return false;
  }
}
function bitmapAdd(str, key) {
  let m;
  try { m = str ? BigInt(str) : 0n; } catch { m = 0n; }
  m |= 1n << BigInt(BIT[key]);
  return m.toString();
}

await mongoose.connect(MONGODB_URI);
console.log(`Connected. Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);

const userColl = mongoose.connection.db.collection("users");
const roleColl = mongoose.connection.db.collection("roles");

const LEGACY = ["bugs.view", "dev.workitems.view"];

async function migrateCollection(coll, label, listField) {
  const cursor = coll.find({
    $or: [
      { [listField]: { $in: LEGACY } },
      // also catch users whose bitmap has the retired bits set
      ...[BIT["bugs.view"], BIT["dev.workitems.view"]].map((b) => ({
        permissionBitmap: { $exists: true, $ne: null, $ne: "0" },
        // can't bitmap-AND in a plain query — fetch all with non-empty and filter in JS
      })),
    ],
  });

  let scanned = 0;
  let updated = 0;
  await coll
    .find({
      $or: [
        { [listField]: { $in: LEGACY } },
        { permissionBitmap: { $exists: true, $ne: null, $ne: "0" } },
      ],
    })
    .forEach(async () => {});

  // Simpler: scan all and update in batches.
  const all = await coll
    .find({}, { projection: { _id: 1, [listField]: 1, permissionBitmap: 1, userId: 1, name: 1 } })
    .toArray();
  for (const doc of all) {
    scanned += 1;
    const arr = doc[listField] ?? [];
    const arrHasLegacy = arr.some((k) => LEGACY.includes(k));
    const bmHasLegacy =
      bitmapHas(doc.permissionBitmap, "bugs.view") ||
      bitmapHas(doc.permissionBitmap, "dev.workitems.view");
    if (!arrHasLegacy && !bmHasLegacy) continue;
    const already =
      arr.includes("dev.member") || bitmapHas(doc.permissionBitmap, "dev.member");
    if (already) continue;

    const nextArr = arr.includes("dev.member") ? arr : [...arr, "dev.member"];
    const nextBitmap = bitmapAdd(doc.permissionBitmap, "dev.member");
    updated += 1;
    console.log(
      `  + ${label} ${doc.userId ?? doc.name ?? doc._id}: grant dev.member`,
    );
    if (APPLY) {
      await coll.updateOne(
        { _id: doc._id },
        { $set: { [listField]: nextArr, permissionBitmap: nextBitmap } },
      );
    }
  }
  console.log(`${label}: scanned ${scanned}, ${APPLY ? "updated" : "would update"} ${updated}`);
  void cursor;
}

console.log("\nUsers:");
await migrateCollection(userColl, "user", "enabledFeatures");
console.log("\nRoles:");
await migrateCollection(roleColl, "role", "features");

await mongoose.disconnect();
console.log(`\nDone. ${APPLY ? "Applied." : "Dry-run only — re-run with --apply to write."}`);
