"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  icon?: string;
  content: ReactNode;
};

const STORAGE_KEY = "rivalry-page-tab";

export function RivalryPageTabs({ tabs }: { tabs: Tab[] }) {
  const fallback = tabs[0]?.id ?? "";
  const [active, setActive] = useState(fallback);
  // We must not write the URL hash on the very first effect pass, otherwise
  // SSR's default `active` ("rivalry") would clobber `#civilwar` in the URL
  // before the hydration effect's state update lands. Flip this flag only
  // after we've read the persisted value.
  const hydratedRef = useRef(false);

  // Hydrate from URL hash first (so a shared link can deep-link), then
  // fall back to the last-used tab in localStorage. Doing this in an effect
  // (rather than lazy useState init) keeps SSR markup deterministic.
  useEffect(() => {
    const valid = (id: string | null | undefined) =>
      !!id && tabs.some((t) => t.id === id);
    const hash =
      typeof window !== "undefined"
        ? window.location.hash.replace(/^#/, "")
        : "";
    let next: string | null = null;
    if (valid(hash)) {
      next = hash;
    } else {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (valid(stored)) next = stored;
      } catch {
        // localStorage unavailable
      }
    }
    if (next && next !== active) setActive(next);
    hydratedRef.current = true;
    // tabs identity is stable per render of the parent server component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the tab choice. Skipped until hydration so SSR's default value
  // can't overwrite the user's actual hash.
  useEffect(() => {
    if (!hydratedRef.current || !active) return;
    try {
      localStorage.setItem(STORAGE_KEY, active);
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      const desired = `#${active}`;
      if (window.location.hash !== desired) {
        history.replaceState(null, "", desired);
      }
    }
  }, [active]);

  // Respond to back/forward navigation that changes the hash.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && tabs.some((t) => t.id === hash)) {
        setActive(hash);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [tabs]);

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-muted/40 p-2">
        <div className="grid grid-cols-2 gap-1.5">
          {tabs.map((t) => {
            const isActive = t.id === current?.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={
                  "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition " +
                  (isActive
                    ? "border-primary/50 bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground")
                }
              >
                {t.icon ? <span>{t.icon}</span> : null}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
