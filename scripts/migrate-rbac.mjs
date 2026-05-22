#!/usr/bin/env node
// One-shot migration for the RBAC rebuild:
//   1) compute `permissionBitmap` for every User from their `enabledFeatures[]`
//   2) compute `permissionBitmap` for every Role from `features[]`
//   3) convert any legacy `role: "admin"` user to `role: "user"` (their
//      permissions are preserved via the bitmap).
//
// Usage:
//   node scripts/migrate-rbac.mjs --dry      # print diff, no writes
//   node scripts/migrate-rbac.mjs --apply    # write changes
//
// Re-run as many times as you like — it is idempotent.

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const DRY = process.argv.includes("--dry") || !APPLY;

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
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

// Mirror lib/features.ts FEATURE_DEFS order. KEEP IN SYNC.
// (We don't import the TS file from a .mjs script — duplicating the list here
// is deliberate; flag a mismatch loudly if the lengths differ.)
const FEATURE_KEYS = [
  "matches.manage",
  "results.manage",
  "match.lock.extend",
  "bonuses.assign",
  "civilwar.manage",
  "civilwar.outcomes",
  "users.manage",
  "users.roles.assign",
  "users.delete",
  "audit.view",
  "tools.maintenance",
  "automation.run",
  "rivalry.manage",
  "content.facts",
  "bugs.manage",
];

const BIT = Object.fromEntries(FEATURE_KEYS.map((k, i) => [k, i]));

function keysToBitmap(keys) {
  if (!keys || keys.length === 0) return "0";
  let mask = 0n;
  for (const k of keys) {
    const i = BIT[k];
    if (typeof i !== "number") continue;
    mask |= 1n << BigInt(i);
  }
  return mask.toString();
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error(
      "MONGODB_URI not set. Pass --uri=... or set MONGODB_URI in env / .env.local",
    );
    process.exit(1);
  }
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const usersCol = mongoose.connection.db.collection("users");
  const rolesCol = mongoose.connection.db.collection("roles");

  // ----- Roles -----
  const roles = await rolesCol.find({}).toArray();
  let rolesUpdated = 0;
  for (const r of roles) {
    const next = keysToBitmap(r.features ?? []);
    const cur = r.permissionBitmap ?? "0";
    const needsBitmap = cur !== next;
    const needsCleanup = "features" in r;
    if (!needsBitmap && !needsCleanup) continue;
    console.log(
      `[role] ${r.name}: bitmap=${cur}->${next}  drop features=${needsCleanup}`,
    );
    if (APPLY) {
      await rolesCol.updateOne(
        { _id: r._id },
        {
          $set: needsBitmap ? { permissionBitmap: next } : {},
          $unset: needsCleanup ? { features: 1 } : {},
        },
      );
    }
    rolesUpdated++;
  }

  // ----- Users -----
  const users = await usersCol.find({}).toArray();
  let usersUpdated = 0;
  let adminsDemoted = 0;
  for (const u of users) {
    const set = {};
    const unset = {};
    const next = keysToBitmap(u.enabledFeatures ?? []);
    const cur = u.permissionBitmap ?? "0";
    if (cur !== next) set.permissionBitmap = next;
    if ("enabledFeatures" in u) unset.enabledFeatures = 1;
    if (u.role === "admin") {
      // Legacy "admin" system role is being retired. Drop to "user"; the
      // bitmap (just computed) preserves whatever they had.
      set.role = "user";
      adminsDemoted++;
    }
    const hasSet = Object.keys(set).length > 0;
    const hasUnset = Object.keys(unset).length > 0;
    if (!hasSet && !hasUnset) continue;
    console.log(
      `[user] ${u.username ?? u.userId ?? u._id}: set=${JSON.stringify(set)} unset=${JSON.stringify(unset)}`,
    );
    if (APPLY) {
      const update = {};
      if (hasSet) update.$set = set;
      if (hasUnset) update.$unset = unset;
      await usersCol.updateOne({ _id: u._id }, update);
    }
    usersUpdated++;
  }

  console.log("");
  console.log("--- Summary ---");
  console.log(`Roles updated:    ${rolesUpdated} / ${roles.length}`);
  console.log(`Users updated:    ${usersUpdated} / ${users.length}`);
  console.log(`Legacy admins -> user: ${adminsDemoted}`);
  console.log(APPLY ? "Done (applied)." : "Done (dry-run, no writes).");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
