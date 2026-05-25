// Next.js 16: file convention is `proxy.ts` (was `middleware.ts` in v15).
// Runtime is Node.js (not Edge), so jwt verification works directly.
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const PROTECTED = ["/dashboard", "/leaderboard", "/matches", "/predictions", "/profile", "/analytics", "/admin", "/rivalry", "/rules", "/players"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

// Per-warm-lambda sliding window of request timestamps (last 60s). Exposed
// to /api/dev/diagnostics-tick as `requestsPerMin`. The matcher below excludes
// /api and _next assets so this counts page navigations, not the diag poll
// itself.
const _reqG = global as unknown as { _reqStamps?: number[] };

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

  // Tick the rolling request counter (cheap, no DB).
  const _now = Date.now();
  const _stamps = (_reqG._reqStamps ??= []);
  _stamps.push(_now);
  // Trim anything older than 60s.
  while (_stamps.length && _stamps[0] < _now - 60_000) _stamps.shift();

  // Redirect logged-in users away from auth pages
  if (session && AUTH_PAGES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (needsAuth && !session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Note: role-based access for /admin is enforced by the admin layout via
  // `requireRole`, which reads the current role from the database. We don't
  // check role here because the JWT in the cookie can be stale (e.g. right
  // after a user is promoted to admin) and would otherwise lock them out
  // until they log out and back in.

  const requestHeaders = new Headers(req.headers);
  // Expose the request pathname so server layouts can react to the current
  // route (e.g. clear the rivalry unseen badge when on /rivalry).
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
