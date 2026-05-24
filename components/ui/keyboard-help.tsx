"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";

export type ShortcutEntry = { keys: string[]; label: string; group?: string };

export function KeyboardHelp({
  open,
  onOpenChange,
  shortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: ShortcutEntry[];
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (open && e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  const groups = new Map<string, ShortcutEntry[]>();
  for (const s of shortcuts) {
    const g = s.group ?? "General";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h3>
          <button
            onClick={() => onOpenChange(false)}
            className="grid h-7 w-7 place-items-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-3">
          {Array.from(groups.entries()).map(([g, list]) => (
            <section key={g}>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-foreground/60">
                {g}
              </div>
              <ul className="space-y-1">
                {list.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-[12.5px] hover:bg-muted"
                  >
                    <span className="text-foreground">{s.label}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k, j) => (
                        <Kbd key={j}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
