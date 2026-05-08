// HTTP fetch with browser-like headers, used by all scrapers.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchHtml(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Slugify a team name into a stable lowercase id chunk. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build a deterministic externalId from match attributes. Stable across re-syncs. */
export function makeExternalId(dateIso: string, teamA: string, teamB: string): string {
  const d = dateIso.slice(0, 10); // YYYY-MM-DD
  const [a, b] = [slug(teamA), slug(teamB)].sort();
  return `sk-${d}-${a}-${b}`;
}
