import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { normalizeMy11circleName } from "@/lib/my11circle";
import {
  captureLeaderboardFromMiniBrowser,
  fetchLeaderboardFromMiniBrowser,
} from "@/lib/my11-mini-browser";
import { getSession } from "@/lib/session";

interface RequestBody {
  matchId: string;
}

interface FetchResponse {
  ok: boolean;
  error?: string;
  contestId?: number;
  sourceMatchId?: number;
  entries?: Array<{
    userId: string;
    username: string;
    handle: string;
    my11circleName: string;
    resolvedMy11Name?: string;
    mappedBy?: "saved" | "inferred" | "none";
    fantasyPoints: number;
    found: boolean;
  }>;
  suggestedMappings?: Array<{
    userId: string;
    username: string;
    handle: string;
    suggestedMy11Name: string;
  }>;
  unmappedLeaderboardNames?: string[];
  needsLogin?: boolean;
}

function normalizeLoose(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inferMy11Name(args: {
  username: string;
  handle: string;
  leaderboardNames: string[];
}) {
  const usernameKey = normalizeLoose(args.username);
  const handleKey = normalizeLoose(args.handle);
  const scored = args.leaderboardNames
    .map((name) => {
      const key = normalizeLoose(name);
      let score = 0;
      if (key === usernameKey || key === handleKey) score = 100;
      else if (
        (usernameKey.length >= 4 && (key.startsWith(usernameKey) || usernameKey.startsWith(key))) ||
        (handleKey.length >= 4 && (key.startsWith(handleKey) || handleKey.startsWith(key)))
      ) {
        score = 70;
      } else if (
        (usernameKey.length >= 5 && (key.includes(usernameKey) || usernameKey.includes(key))) ||
        (handleKey.length >= 5 && (key.includes(handleKey) || handleKey.includes(key)))
      ) {
        score = 50;
      }
      return { name, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length === 1) return scored[0].name;
  if (scored[0].score > scored[1].score) return scored[0].name;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // Get session and verify admin
    const session = await getSession();
    if (!session?.userId || !["admin", "superadmin"].includes(session.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as RequestBody;
    const { matchId } = body;

    if (!matchId) {
      return NextResponse.json({ ok: false, error: "matchId required" }, { status: 400 });
    }

    await connectDB();

    // Get match and verify contest URL exists
    const match = await Match.findById(matchId).select("contestUrl").lean();
    if (!match?.contestUrl) {
      return NextResponse.json({ ok: false, error: "Add the contest link first" }, { status: 400 });
    }

    let leaderboard;
    try {
      leaderboard = await fetchLeaderboardFromMiniBrowser(match.contestUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldFallback =
        message.includes("Unable to resolve leaderboard ids") ||
        message.includes("Invalid contest URL");

      if (!shouldFallback) {
        throw error;
      }

      leaderboard = await captureLeaderboardFromMiniBrowser(180000);
    }

    const resolvedUrl = `https://www.my11circle.com/lobby/contests/leaderboard/${leaderboard.matchId}/${leaderboard.contestId}`;
    await Match.updateOne({ _id: matchId }, { contestUrl: resolvedUrl });

    const users = await User.find().select("username userId my11circleName").lean();

    const leaderboardRows = leaderboard.entries;
    const leaderboardMap = new Map(
      leaderboardRows.map((row) => [normalizeMy11circleName(row.username), row])
    );

    const leaderboardNames = leaderboardRows.map((row) => row.username);
    const usedLeaderboardNames = new Set<string>();
    const suggestedMappings: NonNullable<FetchResponse["suggestedMappings"]> = [];

    const entries = users.map((user) => {
      const savedName = user.my11circleName?.trim() || "";
      const inferredName = !savedName
        ? inferMy11Name({ username: user.username, handle: user.userId, leaderboardNames })
        : null;
      const resolvedMy11Name = savedName || inferredName || "";
      const key = resolvedMy11Name ? normalizeMy11circleName(resolvedMy11Name) : "";
      const hit = key ? leaderboardMap.get(key) : undefined;
      if (hit) usedLeaderboardNames.add(normalizeMy11circleName(hit.username));

      if (!savedName && inferredName) {
        suggestedMappings.push({
          userId: String(user._id),
          username: user.username,
          handle: user.userId,
          suggestedMy11Name: inferredName,
        });
      }

      return {
        userId: String(user._id),
        username: user.username,
        handle: user.userId,
        my11circleName: savedName,
        resolvedMy11Name: resolvedMy11Name || undefined,
        mappedBy: savedName ? (hit ? "saved" : "none") : inferredName ? "inferred" : "none",
        fantasyPoints: hit?.totalScore ?? 0,
        found: !!hit,
      };
    });

    const unmappedLeaderboardNames = leaderboardRows
      .map((row) => row.username)
      .filter((name) => !usedLeaderboardNames.has(normalizeMy11circleName(name)));

    return NextResponse.json({
      ok: true,
      contestId: leaderboard.contestId,
      sourceMatchId: leaderboard.matchId,
      entries,
      suggestedMappings,
      unmappedLeaderboardNames,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("timed out")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Mini-browser timed out. Open a contest leaderboard in the mini-browser window and retry.",
          needsLogin: true,
        } as FetchResponse,
        { status: 408 }
      );
    }

    if (
      message.toLowerCase().includes("not logged") ||
      message.includes("401") ||
      message.toLowerCase().includes("unauthorized")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Mini-browser is not logged in to My11Circle. Login on the mini-browser service, then retry.",
          needsLogin: true,
        } as FetchResponse,
        { status: 401 }
      );
    }

    return NextResponse.json(
      { ok: false, error: message, needsLogin: false } as FetchResponse,
      { status: 500 }
    );
  }
}
