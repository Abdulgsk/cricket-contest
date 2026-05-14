"use client";

import { useState, type ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
  content: ReactNode;
};

export function AdminOverviewTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-muted/40 p-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
          {tabs.map((t) => {
            const isActive = t.id === current?.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition " +
                  (isActive
                    ? "border-primary/50 bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground")
                }
              >
                {t.icon ? <span className="text-xs">{t.icon}</span> : null}
                <span>{t.label}</span>
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span
                    className={
                      "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                      (isActive ? "bg-muted text-foreground" : "bg-warning/20 text-warning")
                    }
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
