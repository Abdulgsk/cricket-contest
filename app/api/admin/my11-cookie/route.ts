import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  checkLogin,
  getSessionCookieMeta,
  saveSessionCookie,
} from "@/lib/my11-api";

interface PostBody {
  cookieHeader?: string;
  // Or pass an array of {name,value} pairs from chrome.cookies.getAll()
  cookies?: Array<{ name: string; value: string }>;
}

function buildCookieHeader(payload: PostBody): string {
  if (payload.cookieHeader && payload.cookieHeader.trim()) {
    return payload.cookieHeader.trim();
  }
  if (Array.isArray(payload.cookies) && payload.cookies.length) {
    // Keep only cookies my11 actually needs
    const allow = new Set([
      "SSID",
      "SSIDuser",
      "NA_VISITOR",
      "sameSiteNoneSupported",
      "device.info.cookie",
    ]);
    return payload.cookies
      .filter((c) => allow.has(c.name))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }
  return "";
}

function isAuthorized(req: NextRequest): boolean {
  if (!env.MY11_COOKIE_SYNC_TOKEN) return false;
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] === env.MY11_COOKIE_SYNC_TOKEN;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
} as const;

function jsonWithCors(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return jsonWithCors({ ok: false, error: "Unauthorized" }, 401);
  }
  const meta = await getSessionCookieMeta();
  return jsonWithCors({ ok: true, ...meta });
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return jsonWithCors({ ok: false, error: "Unauthorized" }, 401);
    }
    const body = (await req.json()) as PostBody;
    const cookieHeader = buildCookieHeader(body);
    if (!cookieHeader.includes("SSID=")) {
      return jsonWithCors({ ok: false, error: "SSID cookie missing in payload" }, 400);
    }
    await saveSessionCookie(cookieHeader);
    const probe = await checkLogin().catch(() => ({ loggedIn: false }));
    return jsonWithCors({ ok: true, loggedIn: probe.loggedIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonWithCors({ ok: false, error: message }, 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "access-control-max-age": "86400" },
  });
}
