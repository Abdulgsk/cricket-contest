"use client";

import * as React from "react";

type PresenceContextValue = {
  /** Set of online userId handles, lowercased for case-insensitive lookup. */
  onlineIds: Set<string>;
  /** Set of online usernames, lowercased. Fallback when only the display name is known. */
  onlineNames: Set<string>;
};

const PresenceContext = React.createContext<PresenceContextValue>({
  onlineIds: new Set(),
  onlineNames: new Set(),
});

const POLL_MS = 30_000;

/**
 * Polls /api/presence/online and exposes the live presence set to all
 * descendants. Mounted once at the (app) layout root.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = React.useState<PresenceContextValue>({
    onlineIds: new Set(),
    onlineNames: new Set(),
  });

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const r = await fetch("/api/presence/online", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as {
          online: Array<{ userId: string; username: string }>;
        };
        if (cancelled) return;
        const ids = new Set<string>();
        const names = new Set<string>();
        for (const u of j.online) {
          if (u.userId) ids.add(u.userId.toLowerCase());
          if (u.username) names.add(u.username.toLowerCase());
        }
        setValue({ onlineIds: ids, onlineNames: names });
      } catch {
        // Stay silent — presence is non-critical.
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    };

    poll();
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
  );
}

/**
 * Returns true if the given userId / username is currently online.
 * Either argument is optional; pass whichever you have.
 */
export function useIsOnline(userId?: string | null, username?: string | null): boolean {
  const { onlineIds, onlineNames } = React.useContext(PresenceContext);
  if (userId && onlineIds.has(userId.toLowerCase())) return true;
  if (username && onlineNames.has(username.toLowerCase())) return true;
  return false;
}
