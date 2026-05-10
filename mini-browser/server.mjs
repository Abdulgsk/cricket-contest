// Ensure browsers are loaded from a stable path next to this script
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolvePath(__dirname, ".browsers");
}

import "dotenv/config";
import { createServer } from "node:http";
import { parse as parseUrl } from "node:url";
import { writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || process.env.MINI_BROWSER_PORT || 4010);
const TOKEN = process.env.MINI_BROWSER_API_TOKEN || process.env.MY11_MINI_BROWSER_TOKEN || "";
const STATE_PATH = process.env.MINI_BROWSER_STATE_PATH || "./my11-storage-state.json";
const HEADLESS = String(process.env.MINI_BROWSER_HEADLESS || "true").toLowerCase() !== "false";
const PREWARM_ON_BOOT = String(process.env.MINI_BROWSER_PREWARM_ON_BOOT || "true").toLowerCase() !== "false";
const KEEPALIVE_ENABLED = String(process.env.MINI_BROWSER_KEEPALIVE_ENABLED || "true").toLowerCase() !== "false";
const KEEPALIVE_INTERVAL_MS = Number(process.env.MINI_BROWSER_KEEPALIVE_INTERVAL_MS || 45000);
const KEEPALIVE_TIMEOUT_MS = Number(process.env.MINI_BROWSER_KEEPALIVE_TIMEOUT_MS || 15000);
const KEEPALIVE_URL = process.env.MINI_BROWSER_KEEPALIVE_URL || "https://www.my11circle.com";
const USER_AGENT =
  process.env.MINI_BROWSER_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let browser;
let context;
let keepAliveTimer = null;

const warmState = {
  bootedAt: new Date().toISOString(),
  warmed: false,
  lastWarmAt: null,
  lastHeartbeatAt: null,
  lastError: null,
};

function logError(event, meta = {}) {
  console.error(`[mini-browser] ${event}`, meta);
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function getBearer(req) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function isAllowedMy11Url(value) {
  try {
    const u = new URL(value);
    return ["my11circle.com", "www.my11circle.com"].includes(u.hostname);
  } catch {
    return false;
  }
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resetBrowserState(reason) {
  logError("context:reset", { reason });
  warmState.warmed = false;
  warmState.lastError = reason;
  if (context) {
    await context.close().catch(() => {});
  }
  context = null;
  if (browser) {
    await browser.close().catch(() => {});
  }
  browser = null;
}

async function ensureContext() {
  if (context) {
    try {
      await context.pages();
      return context;
    } catch {
      await resetBrowserState("stale-context");
    }
  }

  browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  browser.on("disconnected", () => {
    context = null;
    browser = null;
    warmState.warmed = false;
    warmState.lastError = "browser-disconnected";
    logError("browser:disconnected", {});
  });

  const hasState = await fileExists(STATE_PATH);
  context = await browser.newContext({
    storageState: hasState ? STATE_PATH : undefined,
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
  });

  warmState.warmed = true;
  warmState.lastWarmAt = new Date().toISOString();
  warmState.lastError = null;

  return context;
}

async function keepAliveTick() {
  try {
    const ctx = await ensureContext();
    await ctx.request.get(KEEPALIVE_URL, {
      timeout: KEEPALIVE_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    warmState.lastHeartbeatAt = new Date().toISOString();
    warmState.lastError = null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warmState.lastError = message;
    logError("keepalive:error", { message });
    await resetBrowserState(`keepalive-failed:${message}`);
  }
}

async function warmAtBoot() {
  if (!PREWARM_ON_BOOT) return;
  try {
    await ensureContext();
    await keepAliveTick();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warmState.lastError = message;
    logError("warmup:error", { message });
  }
}

function startKeepAliveLoop() {
  if (!KEEPALIVE_ENABLED) return;
  const interval = Number.isFinite(KEEPALIVE_INTERVAL_MS) && KEEPALIVE_INTERVAL_MS > 0
    ? KEEPALIVE_INTERVAL_MS
    : 45000;
  keepAliveTimer = setInterval(() => {
    void keepAliveTick();
  }, interval);
  if (typeof keepAliveTimer.unref === "function") {
    keepAliveTimer.unref();
  }
}

async function persistState() {
  if (!context) return;
  const state = await context.storageState();
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function extractIdsFromUrl(value) {
  const m = value.match(/\/leaderboard\/(\d+)\/(\d+)/);
  if (!m) return null;
  return { matchId: Number(m[1]), contestId: Number(m[2]) };
}

async function assertLoggedIn(ctx) {
  const cookies = await ctx.cookies("https://www.my11circle.com");
  const loggedIn = cookies.some((c) => /ssid|session|token|auth|JSESSIONID/i.test(c.name));
  if (!loggedIn) {
    throw new Error("Mini-browser is not logged in to My11Circle");
  }
}

async function fetchLeaderboard(ctx, contestUrl) {
  if (!isAllowedMy11Url(contestUrl)) {
    throw new Error("contestUrl must be a my11circle.com URL");
  }

  await assertLoggedIn(ctx);

  const page = await ctx.newPage();
  try {
    await page.goto(contestUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    let ids = extractIdsFromUrl(finalUrl);

    if (!ids) {
      const html = await page.content();
      const matchId = html.match(/"matchId"\s*:\s*(\d+)/)?.[1];
      const contestId = html.match(/"contestId"\s*:\s*(\d+)/)?.[1];
      if (matchId && contestId) {
        ids = { matchId: Number(matchId), contestId: Number(contestId) };
      }
    }

    if (!ids) {
      throw new Error("Unable to resolve leaderboard ids from contest URL");
    }

    const referer = `https://www.my11circle.com/lobby/contests/leaderboard/${ids.matchId}/${ids.contestId}`;
    const bestByUser = new Map();
    const seenTokens = new Set();
    let pagingToken = "";

    for (let i = 0; i < 20; i++) {
      const res = await ctx.request.fetch(
        "https://www.my11circle.com/api/lobbyApi/contests/v1/getLeaderBoard",
        {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            "content-type": "application/json;charset=UTF-8",
            origin: "https://www.my11circle.com",
            referer,
          },
          data: {
            contestId: ids.contestId,
            matchId: ids.matchId,
            pagingToken,
          },
        }
      );

      if (!res.ok()) {
        if (res.status() === 401 || res.status() === 403) {
          throw new Error("Mini-browser is logged out. Please login again.");
        }
        throw new Error(`Leaderboard request failed (${res.status()})`);
      }

      const data = await res.json();
      const rows = Array.isArray(data?.leaderboard) ? data.leaderboard : [];

      for (const row of rows) {
        if (!row?.username) continue;
        const key = String(row.username).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const score = Number(row.totalScore || 0);
        const old = bestByUser.get(key);
        if (!old || score > old.totalScore) {
          bestByUser.set(key, {
            username: String(row.username),
            totalScore: score,
            rank: typeof row.rank === "number" ? row.rank : null,
          });
        }
      }

      const nextToken = String(data?.pagingToken || "");
      if (!nextToken || seenTokens.has(nextToken)) break;
      seenTokens.add(nextToken);
      pagingToken = nextToken;
    }

    return {
      contestId: ids.contestId,
      matchId: ids.matchId,
      entries: Array.from(bestByUser.values()),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureFirstLeaderboardResponse(ctx, payload) {
  await assertLoggedIn(ctx);

  const timeoutMs = Number(payload.timeoutMs || 120000);
  const openLobby = payload.openLobby !== false;
  let helperPage = null;

  if (openLobby) {
    helperPage = await ctx.newPage();
    await helperPage.goto("https://www.my11circle.com/lobby/contests", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  }

  try {
    return await new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        ctx.off("response", onResponse);
        reject(
          new Error(
            "Timed out waiting for leaderboard API. Open a contest leaderboard in the mini-browser and retry."
          )
        );
      }, timeoutMs);

      const onResponse = async (response) => {
        try {
          if (done) return;
          const url = response.url();
          const req = response.request();
          if (
            req.method() !== "POST" ||
            !url.includes("/api/lobbyApi/contests/v1/getLeaderBoard")
          ) {
            return;
          }

          const raw = req.postData() || "{}";
          const post = JSON.parse(raw);
          const matchId = Number(post.matchId);
          const contestId = Number(post.contestId);
          if (!Number.isFinite(matchId) || !Number.isFinite(contestId)) {
            return;
          }

          const data = await response.json().catch(() => ({}));
          const rows = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
          const bestByUser = new Map();

          for (const row of rows) {
            if (!row?.username) continue;
            const key = String(row.username)
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "");
            const score = Number(row.totalScore || 0);
            const old = bestByUser.get(key);
            if (!old || score > old.totalScore) {
              bestByUser.set(key, {
                username: String(row.username),
                totalScore: score,
                rank: typeof row.rank === "number" ? row.rank : null,
              });
            }
          }

          done = true;
          clearTimeout(timer);
          ctx.off("response", onResponse);
          resolve({
            contestId,
            matchId,
            entries: Array.from(bestByUser.values()),
            capturedFrom: "first-response",
          });
        } catch {
          // Ignore malformed payloads and keep listening.
        }
      };

      ctx.on("response", onResponse);
    });
  } finally {
    if (helperPage) {
      await helperPage.close().catch(() => {});
    }
  }
}

async function handleMy11Request(ctx, payload) {
  const method = payload.method || "GET";
  const targetUrl = payload.url;
  if (!targetUrl || !isAllowedMy11Url(targetUrl)) {
    throw new Error("Only my11circle.com URLs are allowed");
  }

  await assertLoggedIn(ctx);

  const res = await ctx.request.fetch(targetUrl, {
    method,
    headers: payload.headers || {},
    data: payload.body,
  });

  const responseType = payload.responseType === "text" ? "text" : "json";
  const data = responseType === "text" ? await res.text() : await res.json().catch(() => null);

  return {
    url: targetUrl,
    status: res.status(),
    ok: res.ok(),
    headers: res.headers(),
    data,
  };
}

const server = createServer(async (req, res) => {
  const { pathname } = parseUrl(req.url || "", true);

  if (pathname === "/health" && req.method === "GET") {
    return json(res, 200, {
      ok: true,
      warmState,
      keepAlive: {
        enabled: KEEPALIVE_ENABLED,
        intervalMs: KEEPALIVE_INTERVAL_MS,
      },
    });
  }

  if (!TOKEN) {
    return json(res, 500, { ok: false, error: "MINI_BROWSER_API_TOKEN is missing" });
  }

  if (getBearer(req) !== TOKEN) {
    return json(res, 401, { ok: false, error: "Unauthorized" });
  }

  try {
    const payload = await readJsonBody(req);
    const ctx = await ensureContext();

    if (pathname === "/v1/my11/session-status" && req.method === "POST") {
      const cookies = await ctx.cookies("https://www.my11circle.com");
      const cookieNames = cookies.map((c) => c.name);
      const loggedIn = cookieNames.some((name) => /ssid|session|token|auth|JSESSIONID/i.test(name));
      return json(res, 200, { ok: true, data: { loggedIn, cookieNames } });
    }

    if (pathname === "/v1/my11/login" && req.method === "POST") {
      const page = await ctx.newPage();
      try {
        await page.goto("https://www.my11circle.com", { waitUntil: "domcontentloaded", timeout: 60000 });
        const waitForLogin = Boolean(payload.waitForLogin);
        if (!waitForLogin) {
          return json(res, 200, { ok: true, data: { opened: true, waitForLogin: false } });
        }

        const timeoutMs = Number(payload.timeoutMs || 300000);
        const start = Date.now();
        let loggedIn = false;

        while (Date.now() - start < timeoutMs) {
          const cookies = await ctx.cookies("https://www.my11circle.com");
          loggedIn = cookies.some((c) => /ssid|session|token|auth|JSESSIONID/i.test(c.name));
          if (loggedIn) break;
          await page.waitForTimeout(1500);
        }

        if (!loggedIn) {
          throw new Error("Login timeout. Complete login and retry.");
        }

        await persistState();
        return json(res, 200, { ok: true, data: { loggedIn: true, waitForLogin: true } });
      } finally {
        const waitForLogin = Boolean(payload.waitForLogin);
        if (waitForLogin) {
          await page.close().catch(() => {});
        }
      }
    }

    if (pathname === "/v1/my11/leaderboard" && req.method === "POST") {
      const data = await fetchLeaderboard(ctx, String(payload.contestUrl || ""));
      await persistState();
      return json(res, 200, { ok: true, data });
    }

    if (pathname === "/v1/my11/capture-leaderboard" && req.method === "POST") {
      const data = await captureFirstLeaderboardResponse(ctx, payload || {});
      await persistState();
      return json(res, 200, { ok: true, data });
    }

    if (pathname === "/v1/my11/upload-state" && req.method === "POST") {
      if (!payload.state || typeof payload.state !== "object") {
        return json(res, 400, { ok: false, error: "state object required" });
      }
      await writeFile(STATE_PATH, JSON.stringify(payload.state, null, 2), "utf8");
      logInfo("state:uploaded", {});
      return json(res, 200, { ok: true, message: "State uploaded successfully" });
    }

    if (pathname === "/v1/my11/download-state" && req.method === "GET") {
      try {
        const state = await readFile(STATE_PATH, "utf8");
        return json(res, 200, { ok: true, state: JSON.parse(state) });
      } catch (error) {
        return json(res, 404, { ok: false, error: "State file not found" });
      }
    }

    if (pathname === "/v1/my11/request" && req.method === "POST") {
      const data = await handleMy11Request(ctx, payload);
      await persistState();
      return json(res, 200, { ok: true, data });
    }

    return json(res, 404, { ok: false, error: "Route not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logError("request:error", { pathname, method: req.method, message });
    return json(res, 500, { ok: false, error: message });
  }
});

server.listen(PORT, () => {
  console.log(`my11-mini-browser listening on :${PORT}`);
  void warmAtBoot();
  startKeepAliveLoop();
});

process.on("SIGINT", async () => {
  try {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    if (context) await persistState();
    if (browser) await browser.close();
  } finally {
    process.exit(0);
  }
});
