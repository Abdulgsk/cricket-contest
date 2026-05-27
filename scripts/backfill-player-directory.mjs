// Backfill the Player directory from every existing UserMatchTeam.players row.
//
// Run:  node scripts/backfill-player-directory.mjs
//
// Idempotent. Keyed by my11's numeric `id` so re-runs only touch lastSeenAt
// and any drifted name / role / image fields. Safe to run during a live
// match — read-only against UserMatchTeam, write-only to Player.

import fs from "node:fs";
import mongoose from "mongoose";

function loadEnv() {
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      out[t.slice(0, i).trim()] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
const uri = env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI missing (set in .env.local or environment).");
  process.exit(1);
}

const PlayerSchema = new mongoose.Schema(
  {
    my11Id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    dName: { type: String, default: "" },
    sName: String,
    role: String,
    roleName: String,
    roleSubType: String,
    teamId: { type: Number, default: null },
    teamName: String,
    imgURL: String,
    firstSeenAt: { type: Date, default: () => new Date() },
    lastSeenAt: { type: Date, default: () => new Date(), index: true },
    lastMatchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match", default: null },
  },
  { timestamps: true }
);

const Player =
  mongoose.models.Player || mongoose.model("Player", PlayerSchema);

// Minimal UserMatchTeam shape for the read.
const UmtPlayerSchema = new mongoose.Schema(
  {
    id: Number,
    name: String,
    dName: String,
    sName: String,
    role: String,
    roleName: String,
    roleSubType: String,
    teamId: { type: Number, default: null },
    teamName: String,
    imgURL: String,
  },
  { _id: false, strict: false }
);
const UmtSchema = new mongoose.Schema(
  {
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: "Match" },
    fetchedAt: Date,
    players: [UmtPlayerSchema],
  },
  { strict: false, timestamps: true }
);
const UserMatchTeam =
  mongoose.models.UserMatchTeam ||
  mongoose.model("UserMatchTeam", UmtSchema);

async function main() {
  console.log("Connecting to MongoDB…");
  await mongoose.connect(uri);

  const rows = await UserMatchTeam.find({})
    .select("matchId fetchedAt players")
    .lean();
  console.log(`Read ${rows.length} UserMatchTeam rows.`);

  const latest = new Map();
  let observed = 0;
  for (const r of rows) {
    const at = r.fetchedAt ? new Date(r.fetchedAt) : new Date(0);
    for (const p of r.players ?? []) {
      if (!Number.isFinite(p?.id)) continue;
      observed++;
      const prev = latest.get(p.id);
      if (!prev || at > prev.seenAt) {
        latest.set(p.id, { row: p, seenAt: at, matchId: r.matchId });
      }
    }
  }

  console.log(
    `Observed ${observed} roster entries → ${latest.size} distinct players.`
  );
  if (latest.size === 0) {
    console.log("Nothing to backfill. Exiting.");
    await mongoose.disconnect();
    return;
  }

  const ops = Array.from(latest.entries()).map(
    ([my11Id, { row, seenAt, matchId }]) => ({
      updateOne: {
        filter: { my11Id },
        update: {
          $set: {
            name: row.name,
            dName: row.dName ?? row.name,
            sName: row.sName,
            role: row.role,
            roleName: row.roleName,
            roleSubType: row.roleSubType,
            teamId: row.teamId ?? null,
            teamName: row.teamName,
            imgURL: row.imgURL,
            lastSeenAt: seenAt,
            lastMatchId: matchId,
          },
          $setOnInsert: { my11Id, firstSeenAt: seenAt },
        },
        upsert: true,
      },
    })
  );

  console.log(`Writing ${ops.length} upsert operations…`);
  const res = await Player.bulkWrite(ops, { ordered: false });
  console.log(
    `Done. upserted=${res.upsertedCount ?? 0} modified=${res.modifiedCount ?? 0}`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
