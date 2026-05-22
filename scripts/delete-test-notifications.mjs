/**
 * One-off cleanup: removes the old "Test reminder" notifications created by
 * the legacy sendTestReminderAction (those rows whose title === "Test reminder"
 * and body starts with "🏏 Test reminder").
 *
 * Run:
 *   node scripts/delete-test-notifications.mjs
 * or to delete a specific id:
 *   node scripts/delete-test-notifications.mjs 69fe37ef9bd0ef4a7b2827ef
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

const id = process.argv[2];

const NotificationSchema = new mongoose.Schema({}, { strict: false, collection: "notifications" });
const Notification = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);

await mongoose.connect(MONGODB_URI);

let result;
if (id) {
  result = await Notification.deleteOne({ _id: id });
  console.log(`Deleted by id=${id}:`, result);
} else {
  result = await Notification.deleteMany({
    $or: [
      { title: "Test reminder" },
      { body: { $regex: "^🏏 Test reminder" } },
    ],
  });
  console.log("Deleted test notifications:", result);
}

await mongoose.disconnect();
process.exit(0);
