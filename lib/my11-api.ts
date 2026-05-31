/**
 * Direct My11Circle API client.
 *
 * Auth model: SSID + SSIDuser cookies harvested from a normal browser session
 * (via the cricket-contest browser extension or pasted manually). No captcha,
 * no headless browser required for data fetches.
 */

import { connectDB } from "@/lib/db";
import { getSettings, Settings, invalidateSettingsCache } from "@/models/Settings";

const BASE = "https://www.my11circle.com";

const COMMON_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-GB,en;q=0.8",
  "content-type": "application/json;charset=UTF-8",
  origin: BASE,
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
};

export class My11AuthError extends Error {
  constructor(message = "My11 session is invalid or expired") {
    super(message);
    this.name = "My11AuthError";
  }
}

/** Thrown when My11 says the leaderboard exists but isn't ready yet (errorCode 141). */
export class My11NotReadyError extends Error {
  constructor(message = "My11 leaderboard not ready yet. Try again after the match is scored.") {
    super(message);
    this.name = "My11NotReadyError";
  }
}

export interface My11LeaderboardRow {
  username: string;
  totalScore: number;
  rank: number | null;
  teamId: number | null;
}

export interface My11LeaderboardResult {
  matchId: number;
  contestId: number;
  entries: My11LeaderboardRow[];
}

export interface My11Match {
  matchId: number;
  team1: string;
  team1Short: string;
  team2: string;
  team2Short: string;
  startTime: number | null;
  status: number | null; // 1=upcoming, 2=live, 3=completed
  statusLabel: string;
  displayName: string;
  seriesName: string;
  tourName: string;
  isJoined: boolean;
  raw: unknown;
}

export interface My11Contest {
  contestId: number;
  matchId: number;
  contestName: string;
  prizePool: number | null;
  totalTeams: number | null;
  joinedTeams: number | null;
  entryFee: number | null;
  raw: unknown;
}

interface CallOptions {
  referer?: string;
  timeoutMs?: number;
}

async function loadCookieHeader(): Promise<string> {
  await connectDB();
  const s = await Settings.findOne().select("+my11sessionCookie my11cookieExpiresAt").lean();
  const cookie = s?.my11sessionCookie?.trim();
  if (!cookie) throw new My11AuthError("My11 cookie not configured. Sync from extension.");
  return cookie;
}

async function call<T>(path: string, body: unknown, opts: CallOptions = {}): Promise<T> {
  const cookie = await loadCookieHeader();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        cookie,
        referer: opts.referer ?? `${BASE}/mecspa/lobby/`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      throw new My11AuthError(`My11 returned ${res.status}; cookie expired`);
    }
    if (!res.ok) {
      throw new Error(`My11 ${path} failed (${res.status})`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`My11 ${path} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Probe the session: if this returns ok, the cookie still works. */
export async function checkLogin(): Promise<{ loggedIn: boolean; raw: unknown }> {
  try {
    const data = await call<{ loggedIn?: boolean; loginid?: string }>(
      "/api/signup/v1/checkLogin",
      { source: "lobby" }
    );
    return { loggedIn: data?.loggedIn === true, raw: data };
  } catch (err) {
    if (err instanceof My11AuthError) return { loggedIn: false, raw: null };
    throw err;
  }
}

// ---------- helpers ----------

function asArray(v: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
  return [];
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function statusLabel(n: number | null): string {
  switch (n) {
    case 1:
      return "Upcoming";
    case 2:
      return "Live";
    case 3:
      return "Completed";
    default:
      return "";
  }
}

function extractTeam(raw: unknown): { name: string; short: string } {
  if (!raw || typeof raw !== "object") return { name: "", short: "" };
  const o = raw as Record<string, unknown>;
  return {
    name: typeof o.name === "string" ? o.name : "",
    short: typeof o.dName === "string" ? o.dName : "",
  };
}

// ---------- matches ----------

interface RawMatchesResponse {
  // Real shape: object keyed by status ("1"/"2"/"3") -> array of matches
  matches?: Record<string, Array<Record<string, unknown>>> | Array<Record<string, unknown>>;
}

function normalizeMatch(raw: Record<string, unknown>): My11Match | null {
  const matchId = pickNum(raw, "matchId", "id");
  if (matchId == null) return null;
  const t1 = extractTeam(raw.team1);
  const t2 = extractTeam(raw.team2);
  const status = pickNum(raw, "matchStatus");
  return {
    matchId,
    team1: t1.name,
    team1Short: t1.short,
    team2: t2.name,
    team2Short: t2.short,
    startTime: pickNum(raw, "matchStartTime", "matchFreezeTime"),
    status,
    statusLabel: statusLabel(status),
    displayName: pickStr(raw, "displayName", "name"),
    seriesName: pickStr(raw, "seriesName", "seriesDname"),
    tourName: pickStr(raw, "tourDName"),
    isJoined: raw.isJoined === true,
    raw,
  };
}

/**
 * All matches across sports/tournaments. Real response shape:
 *   { matches: { "1": [...upcoming], "2": [...live], "3": [...completed] }, ... }
 */
export async function listAllMatches(): Promise<My11Match[]> {
  const data = await call<RawMatchesResponse>("/api/lobbyApi/matches/v1/getAllMatches", {
    isNonCashAppVersion: false,
    extendedSportsTabs: true,
  });
  const flat: Array<Record<string, unknown>> = [];
  const m = data.matches;
  if (Array.isArray(m)) {
    flat.push(...m);
  } else if (m && typeof m === "object") {
    for (const arr of Object.values(m)) {
      if (Array.isArray(arr)) flat.push(...arr);
    }
  }
  return flat
    .map(normalizeMatch)
    .filter((x): x is My11Match => x !== null)
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
}

// ---------- contests ----------

interface RawContestsResponse {
  // Note: response top-level joinedContests/hostedContests are NUMBERS (counts), not arrays.
  // Actual contest list is under `contests` only.
  contests?: Array<Record<string, unknown>>;
  errorCode?: number;
  errorMessage?: string;
}

function normalizeContest(raw: Record<string, unknown>, matchId: number): My11Contest | null {
  const contestId = pickNum(raw, "contestId");
  if (contestId == null) return null;
  return {
    contestId,
    matchId,
    contestName: pickStr(raw, "contestName"),
    prizePool: pickNum(raw, "totalPrizeAmount", "prizePool"),
    totalTeams: pickNum(raw, "maxJoinees", "totalTeams"),
    joinedTeams: pickNum(raw, "joinedTeamCount", "joinedTeams"),
    entryFee: pickNum(raw, "entryFee"),
    raw,
  };
}

/** Contests available / joined for a match (joined first). */
export async function listMyContests(matchId: number): Promise<My11Contest[]> {
  const data = await call<RawContestsResponse>(
    "/api/lobbyApi/v1/getMyContests",
    {
      matchId,
      contestCategory: "2,3,4",
      isParentSupported: true,
      isNonCashAppVersion: false,
    },
    { referer: `${BASE}/mecspa/lobby/live-contests/${matchId}` }
  );
  if (typeof data.errorCode === "number" && data.errorCode !== 0) {
    throw new Error(`My11 getMyContests error ${data.errorCode}: ${data.errorMessage ?? ""}`);
  }
  const seen = new Set<number>();
  const out: My11Contest[] = [];
  for (const r of asArray(data.contests)) {
    const c = normalizeContest(r, matchId);
    if (!c) continue;
    if (seen.has(c.contestId)) continue;
    seen.add(c.contestId);
    out.push(c);
  }
  return out;
}

// ---------- leaderboard ----------

interface RawLeaderboardResponse {
  leaderboard?: Array<Record<string, unknown>>;
  myTeam?: Array<Record<string, unknown>>;
  pagingToken?: string;
  errorCode?: number;
  errorMessage?: string;
}

/** Fetch entire leaderboard, paginating until exhausted. */
export async function getLeaderboard(
  matchId: number,
  contestId: number,
  maxPages = 25
): Promise<My11LeaderboardResult> {
  const referer = `${BASE}/mecspa/lobby/leaderboard/${matchId}/${contestId}`;
  const bestByUser = new Map<string, My11LeaderboardRow>();
  const seenTokens = new Set<string>();
  let pagingToken = "";

  for (let i = 0; i < maxPages; i++) {
    const data = await call<RawLeaderboardResponse>(
      "/api/lobbyApi/contests/v1/getLeaderBoard",
      { contestId, matchId, pagingToken },
      { referer }
    );
    if (typeof data.errorCode === "number" && data.errorCode !== 0) {
      if (data.errorCode === 141) {
        // "Not ready" — fine on subsequent pages (just means no more data),
        // but on the very first page we surface it so the UI can tell the user to wait.
        if (i === 0) throw new My11NotReadyError(data.errorMessage);
        break;
      }
      throw new Error(
        `My11 getLeaderBoard error ${data.errorCode}: ${data.errorMessage ?? ""}`
      );
    }
    const rows = asArray(data.leaderboard);
    // Always include user's own team (sometimes paginated separately)
    if (i === 0) {
      for (const my of asArray(data.myTeam)) rows.push(my);
    }
    const nextToken = typeof data.pagingToken === "string" ? data.pagingToken : "";

    for (const row of rows) {
      // Field names confirmed: username, totalScore, rank
      const username = pickStr(row, "username");
      if (!username) continue;
      const totalScore = pickNum(row, "totalScore") ?? 0;
      const rank = pickNum(row, "rank");
      const teamId = pickNum(row, "teamId");
      const key = username.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const existing = bestByUser.get(key);
      if (!existing || totalScore > existing.totalScore) {
        bestByUser.set(key, { username, totalScore, rank, teamId });
      }
    }

    // Stop when API returns an empty page or repeats a token
    if (!rows.length || !nextToken || seenTokens.has(nextToken)) break;
    seenTokens.add(nextToken);
    pagingToken = nextToken;
  }

  return {
    matchId,
    contestId,
    entries: Array.from(bestByUser.values()),
  };
}

/** Convenience: parse `/leaderboard/<matchId>/<contestId>` from a contest URL and fetch. */
export async function fetchLeaderboardFromContestUrl(
  contestUrl: string
): Promise<My11LeaderboardResult> {
  const m = contestUrl.match(/leaderboard\/(\d+)\/(\d+)/);
  if (!m) {
    throw new Error("Contest URL must contain /leaderboard/<matchId>/<contestId>");
  }
  return getLeaderboard(Number(m[1]), Number(m[2]));
}

// ---------- user team details ----------

export interface My11TeamPlayer {
  id: number;
  name: string;
  dName: string;
  sName: string;
  role: string;
  roleName: string;
  roleSubType: string;
  teamId: number | null;
  teamName: string;
  imgURL: string;
  points: number;
  credits: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isWicketKeeper: boolean;
  isTopPlayer: boolean;
  selectedBy: number | null;
  selCapPerc: number | null;
  selVcPerc: number | null;
}

export interface My11UserTeamDetails {
  matchId: number;
  contestId: number;
  userTeamId: number;
  userTeamName: string;
  uName: string;
  rank: number | null;
  score: number | null;
  captainName: string;
  viceCaptainName: string;
  captainIds: number[];
  viceCaptainIds: number[];
  players: My11TeamPlayer[];
  updatedAt: number | null;
}

interface RawTeamDetailsResponse {
  uName?: string;
  rank?: number;
  score?: number;
  captainName?: string[];
  viceCaptainName?: string[];
  captainIds?: number[];
  viceCaptainIds?: number[];
  userTeamId?: number;
  userTeamName?: string;
  updAt?: number;
  players?: Array<Record<string, unknown>>;
  errorCode?: number;
  errorMessage?: string;
}

function normalizeTeamPlayer(
  raw: Record<string, unknown>,
  captainIds: Set<number>,
  vcIds: Set<number>
): My11TeamPlayer | null {
  const id = pickNum(raw, "id");
  if (id == null) return null;
  return {
    id,
    name: pickStr(raw, "name"),
    dName: pickStr(raw, "dName"),
    sName: pickStr(raw, "sName"),
    role: pickStr(raw, "role"),
    roleName: pickStr(raw, "roleName"),
    roleSubType: pickStr(raw, "roleSubType"),
    teamId: pickNum(raw, "teamId"),
    teamName: pickStr(raw, "teamName"),
    imgURL: pickStr(raw, "imgURL"),
    points: pickNum(raw, "points") ?? 0,
    credits: pickNum(raw, "credits") ?? 0,
    // Captain / Vice are the USER's fantasy picks (from captainIds / vcIds on
    // the team payload). The per-player `raw.isCaptain` flag refers to the
    // on-field match captain — ignore it here.
    isCaptain: captainIds.has(id),
    isViceCaptain: vcIds.has(id),
    // Same for `raw.isWicketKeeper` — that's the match wicketkeeper. Role
    // bucketing for layout uses the player's `role` / `roleName` string.
    isWicketKeeper: false,
    isTopPlayer: raw.isTopPlayer === true,
    selectedBy: pickNum(raw, "selectedBy"),
    selCapPerc: pickNum(raw, "selCapPerc"),
    selVcPerc: pickNum(raw, "selVcPerc"),
  };
}

/** Fetch full team details (11 players + points + C/VC) for a single user team. */
export async function getUserTeamDetails(args: {
  matchId: number;
  contestId: number;
  teamId: number;
}): Promise<My11UserTeamDetails> {
  const { matchId, contestId, teamId } = args;
  const referer = `${BASE}/mecspa/lobby/leaderboard/${matchId}/${contestId}`;
  const data = await call<RawTeamDetailsResponse>(
    "/api/lobbyApi/userteams/v1/getTeamDetails",
    { matchId, teamId, contestId, nonCashAppVersion: true },
    { referer }
  );
  if (typeof data.errorCode === "number" && data.errorCode !== 0) {
    if (data.errorCode === 141) {
      throw new My11NotReadyError(data.errorMessage);
    }
    throw new Error(
      `My11 getTeamDetails error ${data.errorCode}: ${data.errorMessage ?? ""}`
    );
  }
  const captainIds = new Set<number>(
    Array.isArray(data.captainIds) ? data.captainIds.filter((n) => typeof n === "number") : []
  );
  const vcIds = new Set<number>(
    Array.isArray(data.viceCaptainIds) ? data.viceCaptainIds.filter((n) => typeof n === "number") : []
  );
  const players = asArray(data.players)
    .map((p) => normalizeTeamPlayer(p, captainIds, vcIds))
    .filter((p): p is My11TeamPlayer => p !== null);
  return {
    matchId,
    contestId,
    userTeamId: typeof data.userTeamId === "number" ? data.userTeamId : teamId,
    userTeamName: typeof data.userTeamName === "string" ? data.userTeamName : "",
    uName: typeof data.uName === "string" ? data.uName : "",
    rank: typeof data.rank === "number" ? data.rank : null,
    score: typeof data.score === "number" ? data.score : null,
    captainName: Array.isArray(data.captainName) ? data.captainName[0] ?? "" : "",
    viceCaptainName: Array.isArray(data.viceCaptainName) ? data.viceCaptainName[0] ?? "" : "",
    captainIds: Array.from(captainIds),
    viceCaptainIds: Array.from(vcIds),
    players,
    updatedAt: typeof data.updAt === "number" ? data.updAt : null,
  };
}

// ---------- cookie storage ----------

/** Save a freshly-harvested cookie string into Settings. */
export async function saveSessionCookie(cookieHeader: string, ttlDays = 30): Promise<void> {
  await connectDB();
  const trimmed = cookieHeader.trim();
  if (!trimmed) throw new Error("empty cookie");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await Settings.updateOne(
    {},
    { $set: { my11sessionCookie: trimmed, my11cookieExpiresAt: expiresAt } },
    { upsert: true }
  );
  invalidateSettingsCache();
}

export async function getSessionCookieMeta(): Promise<{
  hasCookie: boolean;
  expiresAt: string | null;
  ageMs: number | null;
}> {
  await connectDB();
  const s = await Settings.findOne()
    .select("+my11sessionCookie my11cookieExpiresAt updatedAt")
    .lean();
  const has = !!s?.my11sessionCookie?.trim();
  const expiresAt = s?.my11cookieExpiresAt ? new Date(s.my11cookieExpiresAt).toISOString() : null;
  const ageMs = s?.updatedAt ? Date.now() - new Date(s.updatedAt).getTime() : null;
  return { hasCookie: has, expiresAt, ageMs };
}

// Re-export getSettings to discourage direct imports elsewhere
export { getSettings };

// ---------- OTP login flow ----------
//
// Server-side capture of my11circle session cookies via phone + OTP.
//
// The real my11 web client (mecPaj.bundle.js) uses two distinct flows:
//   - Login (existing user): /api/fl/auth/v2/getLogin -> /api/fl/auth/v2/login
//   - Register (new user):   /api/fl/auth/v3/getOtp   -> /api/fl/auth/v3/authenticate
// We try the login flow first; if my11 says the user doesn't exist we fall
// back to the register flow.
//
// IMPORTANT — KNOWN BLOCKER:
// my11 returns `{"error":"Channel blocked","channel_blocked":true}` for these
// endpoints when called from non-residential IPs (Vercel, AWS, most clouds).
// Pasting cookies manually is the only thing that works from such hosts today.
// Set MY11_PROXY_URL to route through a residential proxy if you have one.

const OTP_LOGIN_GET_PATH = process.env.MY11_OTP_LOGIN_GET_PATH || "/api/fl/auth/v2/getLogin";
const OTP_LOGIN_VERIFY_PATH = process.env.MY11_OTP_LOGIN_VERIFY_PATH || "/api/fl/auth/v2/login";
const OTP_REG_GET_PATH = process.env.MY11_OTP_REG_GET_PATH || "/api/fl/auth/v3/getOtp";
const OTP_REG_VERIFY_PATH = process.env.MY11_OTP_REG_VERIFY_PATH || "/api/fl/auth/v3/authenticate";

const REQUIRED_COOKIE_NAMES = ["SSID", "SSIDuser", "NA_VISITOR", "sameSiteNoneSupported", "device.info.cookie"];

function makeDeviceId(): string {
  // Matches the my11 web client's UUIDv4 generator output shape.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = Number(c);
    return (n ^ (16 * Math.random()) >> (n / 4)).toString(16);
  });
}

function parseSetCookies(headerValue: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!headerValue) return out;
  // Node merges multi-value Set-Cookie into one string separated by commas,
  // but commas can also appear inside Expires=. Split on `, ` only when the
  // next chunk looks like `name=`.
  const parts = headerValue.split(/,(?=\s*[A-Za-z0-9_.-]+=)/);
  for (const part of parts) {
    const [pair] = part.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

function mergeCookieHeader(existing: string, fresh: Map<string, string>): string {
  const merged = new Map<string, string>();
  // Start with anything already in the header.
  for (const pair of existing.split(/;\s*/)) {
    const eq = pair.indexOf("=");
    if (eq > 0) merged.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  for (const [k, v] of fresh) merged.set(k, v);
  return Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function rawPost(
  path: string,
  body: unknown,
  initialCookie: string,
): Promise<{ status: number; data: unknown; cookies: Map<string, string>; raw: string }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        ...COMMON_HEADERS,
        ...(initialCookie ? { cookie: initialCookie } : {}),
        referer: `${BASE}/mecspa/loginsignup/`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }
    const cookies = parseSetCookies(res.headers.get("set-cookie"));
    return { status: res.status, data, cookies, raw };
  } finally {
    clearTimeout(timeout);
  }
}

export interface My11OtpSendResult {
  ok: boolean;
  status: number;
  /** "login" if my11 recognised the user, "register" if we fell back to the
   * new-user flow. Tells verifyOtp which endpoint + body shape to use. */
  flow: "login" | "register";
  /** Stable per-session id. Persisted alongside the sendOtp cookies so the
   * verify call can replay it. */
  deviceId: string;
  /** Reg flow returns this and expects it back on /authenticate. */
  uniqueIdentifier: string | null;
  cookieHeader: string;
  raw: unknown;
}

function isChannelBlocked(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.channel_blocked === true || d.error === "Channel blocked";
}

/**
 * Step 1: ask my11 to send an OTP. Tries the login flow first; if that says
 * the user doesn't exist (`USER_NOT_FOUND`-style), falls back to register.
 * Captures Set-Cookie so the matching verify call can be made against the
 * same anonymous session.
 */
export async function my11SendOtp(opts: {
  phone: string;
}): Promise<My11OtpSendResult> {
  const phone = opts.phone.replace(/\D/g, "");
  if (!phone) throw new Error("phone required");
  const deviceId = makeDeviceId();

  // 1. Try the existing-user flow.
  const loginRes = await rawPost(OTP_LOGIN_GET_PATH, { loginid: phone, deviceId }, "");
  if (isChannelBlocked(loginRes.data)) {
    return {
      ok: false,
      status: loginRes.status,
      flow: "login",
      deviceId,
      uniqueIdentifier: null,
      cookieHeader: "",
      raw: loginRes.data,
    };
  }
  const loginData = (loginRes.data ?? {}) as Record<string, unknown>;
  const loginErr = pickStr(loginData, "ErrorMessage", "errorMessage", "error");
  const userNotFound =
    /user.*(not|n[o]t).*found|no.*user|not.*registered/i.test(loginErr) ||
    loginData.userExists === false ||
    loginData.isRegistered === false;
  const loginOk = loginRes.status >= 200 && loginRes.status < 300 && !loginErr;

  if (loginOk) {
    const cookieHeader = Array.from(loginRes.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    return {
      ok: true,
      status: loginRes.status,
      flow: "login",
      deviceId,
      uniqueIdentifier: null,
      cookieHeader,
      raw: loginRes.data,
    };
  }

  if (!userNotFound) {
    return {
      ok: false,
      status: loginRes.status,
      flow: "login",
      deviceId,
      uniqueIdentifier: null,
      cookieHeader: "",
      raw: loginRes.data,
    };
  }

  // 2. Fall back to the register flow.
  const regRes = await rawPost(
    OTP_REG_GET_PATH,
    { mobile: phone, deviceId, deviceName: "", refCode: "", isPlaycircle: false },
    "",
  );
  const regData = (regRes.data ?? {}) as Record<string, unknown>;
  const uniqueIdentifier =
    pickStr(regData, "uniqueIdentifier", "uniqId", "transactionId") || null;
  const cookieHeader = Array.from(regRes.cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const regOk = regRes.status >= 200 && regRes.status < 300 && regData.success !== false;
  return {
    ok: regOk,
    status: regRes.status,
    flow: "register",
    deviceId,
    uniqueIdentifier,
    cookieHeader,
    raw: regRes.data,
  };
}

export interface My11OtpVerifyResult {
  ok: boolean;
  status: number;
  loggedIn: boolean;
  capturedCookies: string[];
  raw: unknown;
}

/**
 * Step 2: verify the OTP using the same flow + cookies + deviceId that
 * sendOtp used. On success, captures the my11 session cookies and persists
 * them via `saveSessionCookie()`.
 */
export async function my11VerifyOtp(opts: {
  phone: string;
  otp: string;
  flow: "login" | "register";
  deviceId: string;
  uniqueIdentifier?: string | null;
  priorCookies?: string;
}): Promise<My11OtpVerifyResult> {
  const phone = opts.phone.replace(/\D/g, "");
  const otp = opts.otp.replace(/\D/g, "");
  if (!phone) throw new Error("phone required");
  if (!otp) throw new Error("otp required");

  let path: string;
  let body: Record<string, unknown>;
  if (opts.flow === "login") {
    path = OTP_LOGIN_VERIFY_PATH;
    body = {
      loginid: phone,
      otp,
      reasonCode: 1,
      challenge: "",
      deviceId: opts.deviceId,
      deviceName: "",
    };
  } else {
    path = OTP_REG_VERIFY_PATH;
    body = {
      mobile: phone,
      otp,
      uniqueIdentifier: opts.uniqueIdentifier ?? "",
    };
  }

  const res = await rawPost(path, body, opts.priorCookies ?? "");
  const data = (res.data ?? {}) as Record<string, unknown>;
  const httpOk = res.status >= 200 && res.status < 300;
  const bodyErr = pickStr(data, "ErrorMessage", "errorMessage", "error");
  const ok = httpOk && !bodyErr;
  const merged = mergeCookieHeader(opts.priorCookies ?? "", res.cookies);
  const capturedNames = Array.from(res.cookies.keys());
  const haveSsid = /(?:^|;\s*)SSID=/.test(merged);
  let loggedIn = false;
  if (ok && haveSsid) {
    const filtered = merged
      .split(/;\s*/)
      .filter((p) => REQUIRED_COOKIE_NAMES.includes(p.split("=")[0]))
      .join("; ");
    await saveSessionCookie(filtered);
    const probe = await checkLogin().catch(() => ({ loggedIn: false }));
    loggedIn = probe.loggedIn;
  }
  return { ok, status: res.status, loggedIn, capturedCookies: capturedNames, raw: res.data };
}
