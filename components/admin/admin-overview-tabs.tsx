"use client";

import { useState, type ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  content: ReactNode;
};

export function AdminOverviewTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="space-y-3">
      <div className="-mx-4 sm:mx-0">
        <div className="flex gap-1.5 overflow-x-auto px-4 sm:px-0 pb-1 scrollbar-thin">
          {tabs.map((t) => {
            const isActive = t.id === current?.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={
                  "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition " +
                  (isActive
                    ? "bg-primary text-primary-foreground shadow"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60")
                }
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span
                    className={
                      "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                      (isActive ? "bg-primary-foreground/20" : "bg-warning/20 text-warning")
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
