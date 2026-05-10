import { env } from "@/lib/env";

interface MiniBrowserEnvelope<T> {
  ok: boolean;
  status?: number;
  error?: string;
  data?: T;
}

export interface My11LeaderboardEntry {
  username: string;
  totalScore: number;
  rank: number | null;
}

export interface My11LeaderboardResult {
  contestId: number;
  matchId: number;
  entries: My11LeaderboardEntry[];
}

export interface MiniBrowserRuntimeStatus {
  ok: boolean;
  warmState?: {
    bootedAt?: string;
    warmed?: boolean;
    lastWarmAt?: string | null;
    lastHeartbeatAt?: string | null;
    lastError?: string | null;
  };
}

interface My11RequestArgs {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  responseType?: "json" | "text";
}

interface BridgeCallOptions {
  timeoutMs?: number;
}

function requireBridgeConfig() {
  if (!env.MY11_MINI_BROWSER_URL) {
    throw new Error("MY11_MINI_BROWSER_URL is missing");
  }
  if (!env.MY11_MINI_BROWSER_TOKEN) {
    throw new Error("MY11_MINI_BROWSER_TOKEN is missing");
  }
}

function requireBridgeUrl() {
  if (!env.MY11_MINI_BROWSER_URL) {
    throw new Error("MY11_MINI_BROWSER_URL is missing");
  }
}

async function callBridge<T>(path: string, body: unknown, options?: BridgeCallOptions) {
  requireBridgeConfig();

  const timeoutMs = Number.isFinite(options?.timeoutMs)
    ? Number(options?.timeoutMs)
    : Number.isFinite(env.MY11_MINI_BROWSER_TIMEOUT_MS)
      ? env.MY11_MINI_BROWSER_TIMEOUT_MS
      : 30000;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${env.MY11_MINI_BROWSER_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.MY11_MINI_BROWSER_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });

    const json = (await res.json().catch(() => ({}))) as MiniBrowserEnvelope<T>;

    if (!res.ok || !json.ok || json.data === undefined) {
      throw new Error(json.error || `Mini-browser request failed (${res.status})`);
    }

    return json.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Mini-browser request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLeaderboardFromMiniBrowser(contestUrl: string) {
  return callBridge<My11LeaderboardResult>("/v1/my11/leaderboard", { contestUrl });
}

export async function captureLeaderboardFromMiniBrowser(timeoutMs = 120000) {
  return callBridge<My11LeaderboardResult>("/v1/my11/capture-leaderboard", {
    timeoutMs,
    openLobby: true,
  }, { timeoutMs: timeoutMs + 10000 });
}

export async function proxyMy11Request(args: My11RequestArgs) {
  return callBridge<unknown>("/v1/my11/request", args);
}

export async function getMiniBrowserSessionStatus() {
  return callBridge<{ loggedIn: boolean; cookieNames: string[] }>("/v1/my11/session-status", {});
}

export async function startMiniBrowserLogin() {
  return callBridge<{ opened: boolean; waitForLogin: boolean }>(
    "/v1/my11/login",
    {
      waitForLogin: false,
      timeoutMs: 300000,
    },
    { timeoutMs: 45000 }
  );
}

export async function getMiniBrowserRuntimeStatus() {
  requireBridgeUrl();
  const timeoutMs = Number.isFinite(env.MY11_MINI_BROWSER_TIMEOUT_MS)
    ? env.MY11_MINI_BROWSER_TIMEOUT_MS
    : 30000;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.MY11_MINI_BROWSER_URL}/health`, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as MiniBrowserRuntimeStatus;
    if (!res.ok || !json.ok) {
      throw new Error(`Mini-browser health failed (${res.status})`);
    }
    return json;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Mini-browser health timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
