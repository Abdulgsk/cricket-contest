"use client";
import { useEffect, useState, type ReactNode } from "react";

interface TabDef {
  key: string;
  label: string;
  icon: string;
  node: ReactNode;
  hidden?: boolean;
}

/**
 * Sticky, horizontally-scrollable tab strip for the admin match page so
 * config / pools / predictions / results don't all stack into one infinite
 * scroll. Each tab's content stays mounted (just visually hidden) so any
 * in-progress form input survives a tab switch.
 *
 * The active tab persists per match via `localStorage` so a navigate-away /
 * back doesn't bounce admins back to the first tab.
 */
export function MatchAdminTabs({
  matchId,
  tabs,
  defaultKey,
}: {
  matchId: string;
  tabs: TabDef[];
  defaultKey?: string;
}) {
  const visible = tabs.filter((t) => !t.hidden && t.node);
  const storageKey = `admin-match-tab:${matchId}`;
  const [active, setActive] = useState<string>(defaultKey ?? visible[0]?.key ?? "");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && visible.some((t) => t.key === stored)) {
        setActive(stored);
      }
    } catch {
      // localStorage unavailable — fall back to default.
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (key: string) => {
    setActive(key);
    try {
      localStorage.setItem(storageKey, key);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 sm:mx-0 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border/40">
        <div
          role="tablist"
          aria-label="Match admin sections"
          className="flex items-center gap-1 overflow-x-auto px-2 sm:px-0 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visible.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tab-panel-${t.key}`}
                id={`tab-${t.key}`}
                onClick={() => select(t.key)}
                className={[
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full",
                  "px-3.5 h-9 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                ].join(" ")}
              >
                <span aria-hidden>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.map((t) => (
        <section
          key={t.key}
          role="tabpanel"
          id={`tab-panel-${t.key}`}
          aria-labelledby={`tab-${t.key}`}
          hidden={t.key !== active}
          className="space-y-4"
        >
          {t.node}
        </section>
      ))}
    </div>
  );
}
