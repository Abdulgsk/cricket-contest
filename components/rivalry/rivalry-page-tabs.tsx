"use client";

import { useState, type ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  icon?: string;
  content: ReactNode;
};

export function RivalryPageTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
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
                  "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition " +
                  (isActive
                    ? "bg-background text-foreground shadow-sm ring-1 ring-primary/40"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground")
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
