// Next.js 16: file convention is `proxy.ts` (was `middleware.ts` in v15).
// Runtime is Node.js (not Edge), so jwt verification works directly.
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const PROTECTED = ["/dashboard", "/leaderboard", "/matches", "/predictions", "/profile", "/analytics", "/admin"];
const ADMIN_ONLY = ["/admin"];
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySessionToken(token) : null;

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

  if (ADMIN_ONLY.some((p) => pathname.startsWith(p))) {
    if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
