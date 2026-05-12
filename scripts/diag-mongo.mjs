import fs from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import mongoose from "mongoose";

function loadEnv() {
  const raw = fs.readFileSync(".env.local", "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnv();
const uri = env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI missing from .env.local");
  process.exit(1);
}
const masked = uri.replace(/(mongodb(?:\+srv)?:\/\/)[^:]+:[^@]+@/, "$1<user>:<pass>@");
console.log("URI:", masked);
const host = uri.match(/@([^/?]+)/)?.[1];
console.log("Host:", host);

try {
  const srv = await dns.resolveSrv("_mongodb._tcp." + host);
  console.log(`SRV records: ${srv.length}`);
  for (const r of srv) console.log(" -", r.name + ":" + r.port);
  console.log("Trying TCP to each SRV target...");
  for (const r of srv) {
    await new Promise((resolve) => {
      const s = net.createConnection({ host: r.name, port: r.port, timeout: 4000 });
      s.on("connect", () => {
        console.log("  TCP OK", r.name);
        s.destroy();
        resolve();
      });
      s.on("timeout", () => {
        console.log("  TCP TIMEOUT", r.name);
        s.destroy();
        resolve();
      });
      s.on("error", (e) => {
        console.log("  TCP ERR ", r.name, "-", e.code || e.message);
        resolve();
      });
    });
  }
} catch (e) {
  console.error("SRV lookup FAILED:", e.code || e.message);
}

console.log("Attempting mongoose connect (8s timeout)...");
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log("Mongo connect OK. Server:", mongoose.connection.host);
  await mongoose.disconnect();
} catch (e) {
  console.error("Mongo connect FAILED:", e?.name, "-", e?.message);
}
