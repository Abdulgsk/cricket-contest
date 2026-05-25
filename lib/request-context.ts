/**
 * Request-context extraction for audit + security trail.
 *
 * - `ip`: client IP (best of x-forwarded-for / x-real-ip / cf-connecting-ip).
 * - `geo`: country/region/city pulled from Vercel & Cloudflare edge headers.
 *   Populated automatically in production; null in local dev.
 * - `device`: friendly browser/OS string parsed from the User-Agent header.
 *   Intentionally tiny — no `ua-parser-js` dep. Good enough for "Chrome on
 *   Mac" / "Safari on iPhone" style audit rows.
 *
 * Never throws. Always safe to call from inside server actions or API routes.
 */

import { headers } from "next/headers";

export type GeoContext = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export type DeviceContext = {
  browser: string;
  os: string;
  /** Compact "Chrome on macOS" / "Safari on iOS" string. */
  label: string;
  raw: string | null;
};

export type RequestContext = {
  ip: string | null;
  geo: GeoContext;
  device: DeviceContext;
  userAgent: string | null;
};

const UNKNOWN_DEVICE: DeviceContext = {
  browser: "Unknown",
  os: "Unknown",
  label: "Unknown device",
  raw: null,
};

const EMPTY_GEO: GeoContext = { country: null, region: null, city: null };

/**
 * Best-effort User-Agent parse. We only care about the top 6 browsers and 5
 * platforms — anything else falls back to "Unknown".
 *
 * Order matters: Edge before Chrome, Chrome before Safari, etc., because their
 * UA strings nest.
 */
export function parseUserAgent(ua: string | null | undefined): DeviceContext {
  if (!ua) return UNKNOWN_DEVICE;
  const s = ua;

  let browser = "Unknown";
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Chrome\//.test(s) && !/Chromium/.test(s)) browser = "Chrome";
  else if (/Chromium\//.test(s)) browser = "Chromium";
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = "Safari";

  let os = "Unknown";
  if (/Windows NT/.test(s)) os = "Windows";
  else if (/Android/.test(s)) os = "Android";
  else if (/(iPhone|iPad|iPod)/.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Linux/.test(s)) os = "Linux";

  return {
    browser,
    os,
    label: `${browser} on ${os}`,
    raw: ua,
  };
}

/** Read geo from edge-provider headers. Vercel uses `x-vercel-ip-*`, CF uses
 * `cf-ipcountry`. Returns null fields outside production. */
export function geoFromHeaders(h: Headers): GeoContext {
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const country =
    decode(h.get("x-vercel-ip-country")) ||
    decode(h.get("cf-ipcountry")) ||
    null;
  const region =
    decode(h.get("x-vercel-ip-country-region")) ||
    decode(h.get("x-vercel-ip-region")) ||
    null;
  const city =
    decode(h.get("x-vercel-ip-city")) ||
    decode(h.get("cf-ipcity")) ||
    null;
  return { country, region, city };
}

/** Pretty "City, Region, CC" string. Empty parts are skipped. Returns null if
 * nothing is known. */
export function formatGeo(geo: GeoContext): string | null {
  const parts = [geo.city, geo.region, geo.country].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return parts.join(", ");
}

/**
 * Collect everything needed for an audit row in one shot. Safe to call outside
 * a request scope — returns empty defaults if `headers()` is unavailable.
 */
export async function getRequestContext(): Promise<RequestContext> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null;
    const userAgent = h.get("user-agent");
    return {
      ip,
      geo: geoFromHeaders(h),
      device: parseUserAgent(userAgent),
      userAgent,
    };
  } catch {
    return {
      ip: null,
      geo: EMPTY_GEO,
      device: UNKNOWN_DEVICE,
      userAgent: null,
    };
  }
}
