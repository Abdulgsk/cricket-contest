import { env } from "@/lib/env";

interface LeaderboardRow {
  username?: string;
  totalScore?: number;
  rank?: number;
  teamId?: number;
}

interface LeaderboardResponse {
  leaderboard?: LeaderboardRow[];
  pagingToken?: string;
}

function extractIdsFromPath(path: string) {
  const direct = path.match(/\/leaderboard\/(\d+)\/(\d+)/);
  if (direct) {
    return { matchId: Number(direct[1]), contestId: Number(direct[2]) };
  }
  return null;
}

async function parseContestUrl(contestUrl: string, sessionCookie?: string) {
  let url: URL;
  try {
    url = new URL(contestUrl);
  } catch {
    throw new Error("Invalid contest URL");
  }

  const fromPath = extractIdsFromPath(url.pathname);
  if (fromPath) {
    return {
      ...fromPath,
      referer: url.toString(),
    };
  }

  const matchIdFromQuery = url.searchParams.get("matchId");
  const contestIdFromQuery = url.searchParams.get("contestId");
  if (matchIdFromQuery && contestIdFromQuery) {
    return {
      matchId: Number(matchIdFromQuery),
      contestId: Number(contestIdFromQuery),
      referer: url.toString(),
    };
  }

  // Invite links may redirect to leaderboard URL; try resolving with auth cookie.
  try {
    const cookie = sessionCookie?.trim() || env.MY11CIRCLE_COOKIE;
    const resolved = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": env.MY11CIRCLE_USER_AGENT,
        ...(cookie ? { cookie } : {}),
      },
      cache: "no-store",
    });

    const finalUrl = new URL(resolved.url);
    const fromRedirect = extractIdsFromPath(finalUrl.pathname);
    if (fromRedirect) {
      return {
        ...fromRedirect,
        referer: finalUrl.toString(),
      };
    }

    const body = await resolved.text();
    const bodyMatchId = body.match(/"matchId"\s*:\s*(\d+)/);
    const bodyContestId = body.match(/"contestId"\s*:\s*(\d+)/);
    if (bodyMatchId && bodyContestId) {
      return {
        matchId: Number(bodyMatchId[1]),
        contestId: Number(bodyContestId[1]),
        referer: finalUrl.toString(),
      };
    }
  } catch {
    // fall through to a clear error below
  }

  throw new Error(
    "Could not resolve contest link. Use leaderboard URL or a valid invite link after login."
  );
}

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function fetchLeaderboardPage(args: {
  matchId: number;
  contestId: number;
  referer: string;
  pagingToken: string;
  sessionCookie?: string;
}) {
  const cookie = args.sessionCookie?.trim() || env.MY11CIRCLE_COOKIE;
  if (!cookie) {
    throw new Error("My11Circle session missing. Paste cookie in admin panel or set MY11CIRCLE_COOKIE.");
  }
  const res = await fetch("https://www.my11circle.com/api/lobbyApi/contests/v1/getLeaderBoard", {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json;charset=UTF-8",
      origin: "https://www.my11circle.com",
      referer: args.referer,
      "user-agent": env.MY11CIRCLE_USER_AGENT,
      cookie,
    },
    body: JSON.stringify({
      contestId: args.contestId,
      matchId: args.matchId,
      pagingToken: args.pagingToken,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("My11Circle session expired. Paste fresh cookie and retry.");
    }
    throw new Error(`My11Circle request failed (${res.status})`);
  }

  const json = (await res.json()) as LeaderboardResponse;
  return json;
}

export async function fetchContestLeaderboard(contestUrl: string, sessionCookie?: string) {
  const parsed = await parseContestUrl(contestUrl, sessionCookie);
  const rows: LeaderboardRow[] = [];
  const seenTokens = new Set<string>();
  let pagingToken = "";

  for (let page = 0; page < 20; page++) {
    const data = await fetchLeaderboardPage({ ...parsed, pagingToken, sessionCookie });
    rows.push(...(data.leaderboard ?? []));

    const nextToken = data.pagingToken ?? "";
    if (!nextToken || seenTokens.has(nextToken)) break;
    seenTokens.add(nextToken);
    pagingToken = nextToken;
  }

  const bestByUser = new Map<
    string,
    {
      username: string;
      totalScore: number;
      rank: number | null;
    }
  >();

  for (const row of rows) {
    if (!row.username) continue;
    const key = normalizeName(row.username);
    const score = Number(row.totalScore ?? 0);
    const existing = bestByUser.get(key);
    if (!existing || score > existing.totalScore) {
      bestByUser.set(key, {
        username: row.username,
        totalScore: score,
        rank: typeof row.rank === "number" ? row.rank : null,
      });
    }
  }

  return {
    contestId: parsed.contestId,
    matchId: parsed.matchId,
    entries: bestByUser,
  };
}

export function normalizeMy11circleName(value: string) {
  return normalizeName(value);
}
