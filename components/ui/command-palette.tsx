"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";

/** A single executable command. */
export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  icon?: React.ReactNode;
  /** When set, this is a deep-link with shortcuts shown on the right. */
  shortcut?: string[];
  /** When typed, prefer commands matching this query. */
  keywords?: string;
  perform: () => void | Promise<void>;
};

function fuzzyScore(q: string, hay: string): number {
  if (!q) return 1;
  q = q.toLowerCase();
  hay = hay.toLowerCase();
  if (hay.includes(q)) return 3;
  let qi = 0;
  let score = 0;
  for (let i = 0; i < hay.length && qi < q.length; i++) {
    if (hay[i] === q[qi]) {
      score += 1;
      qi++;
    }
  }
  if (qi < q.length) return 0;
  return score / hay.length;
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = "Type a command or search…",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
}) {
  const [q, setQ] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (open && e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const ranked = React.useMemo(() => {
    const scored = items
      .map((it) => ({
        it,
        s: Math.max(
          fuzzyScore(q, it.label),
          fuzzyScore(q, it.keywords ?? ""),
          q ? 0 : 0.5,
        ),
      }))
      .filter(({ s }) => s > 0);
    scored.sort((a, b) => b.s - a.s);
    return scored.map(({ it }) => it).slice(0, 30);
  }, [items, q]);

  const groups = React.useMemo(() => {
    const m = new Map<string, CommandItem[]>();
    for (const it of ranked) {
      const k = it.group ?? "Actions";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return Array.from(m.entries());
  }, [ranked]);

  React.useEffect(() => setCursor(0), [q]);

  const run = (it: CommandItem) => {
    onOpenChange(false);
    Promise.resolve().then(() => it.perform());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(ranked.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = ranked[cursor];
      if (it) run(it);
    }
  };

  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-cursor="true"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open || typeof document === "undefined") return null;

  let flatIndex = -1;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-popover/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1.5">
          {groups.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No matches.
            </div>
          ) : (
            groups.map(([g, list]) => (
              <div key={g} className="mb-1.5 last:mb-0">
                <div className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {g}
                </div>
                {list.map((it) => {
                  flatIndex++;
                  const active = flatIndex === cursor;
                  return (
                    <button
                      key={it.id}
                      data-cursor={active || undefined}
                      type="button"
                      onMouseEnter={() => setCursor(flatIndex)}
                      onClick={() => run(it)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] transition",
                        active ? "bg-primary/12 text-foreground" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
                        {it.icon ?? <Search className="h-3.5 w-3.5" />}
                      </span>
                      <span className="flex-1 truncate">
                        <span className="font-medium">{it.label}</span>
                        {it.hint ? (
                          <span className="ml-2 text-muted-foreground">{it.hint}</span>
                        ) : null}
                      </span>
                      {it.shortcut ? (
                        <span className="flex items-center gap-1">
                          {it.shortcut.map((k, i) => (
                            <Kbd key={i}>{k}</Kbd>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-1.5 text-[10.5px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd>
            <span>run</span>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Convenience: enable global ⌘K to toggle the palette and return an
 * `[open, setOpen]` tuple.
 */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);
  return [open, setOpen] as const;
}
