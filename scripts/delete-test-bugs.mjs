/**
 * Soft-deletes (or hard-deletes with --hard) bug reports whose title contains
 * "testing" (case-insensitive). Per project policy user-generated content is
 * soft-deleted by default — pass --hard to actually remove the documents.
 *
 * Run:
 *   node scripts/delete-test-bugs.mjs            # dry run (prints matches)
 *   node scripts/delete-test-bugs.mjs --apply    # soft delete
 *   node scripts/delete-test-bugs.mjs --apply --hard  # hard delete
 */
import fs from "node:fs";
import mongoose from "mongoose";

function loadEnv() {
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Add it to .env.local.");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const HARD = args.has("--hard");

const BugSchema = new mongoose.Schema({}, { strict: false, collection: "bugreports" });
const BugReport = mongoose.models.BugReport || mongoose.model("BugReport", BugSchema);

(async () => {
  await mongoose.connect(MONGODB_URI);
  const filter = { title: { $regex: "testing", $options: "i" } };
  const all = await BugReport.find(filter).select({ _id: 1, title: 1, status: 1, deletedAt: 1 }).lean();
  console.log(`Found ${all.length} bug(s) matching /testing/i:`);
  for (const b of all) {
    console.log(`  - ${b._id}  status=${b.status}  deletedAt=${b.deletedAt ?? "null"}  title=${JSON.stringify(b.title)}`);
  }
  if (!APPLY) {
    console.log("\nDry run. Pass --apply to perform the operation (add --hard to hard-delete).");
    await mongoose.disconnect();
    return;
  }
  if (HARD) {
    const res = await BugReport.deleteMany(filter);
    console.log(`\nHard-deleted ${res.deletedCount} bug(s).`);
  } else {
    const now = new Date();
    const res = await BugReport.updateMany(
      { ...filter, deletedAt: null },
      { $set: { deletedAt: now } },
    );
    console.log(`\nSoft-deleted ${res.modifiedCount} bug(s) (set deletedAt=${now.toISOString()}).`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
