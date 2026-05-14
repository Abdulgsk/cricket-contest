"use client";

import { useEffect, useRef, useState } from "react";
import {
  THEMES,
  THEME_LABEL,
  applyTheme,
  readStoredTheme,
  type Theme,
} from "@/components/theme-init";

// Five swatches per theme — picked to read the palette at a glance:
// [background, card/border tone, primary, accent, foreground].
const THEME_SWATCHES: Record<Theme, string[]> = {
  sand:   ["#faf0da", "#cfb890", "#a87546", "#6d8ea1", "#272727"],
  paper:  ["#f8f5f0", "#dad3c6", "#465c66", "#a88a64", "#262a2e"],
  mist:   ["#f4faff", "#dee7e7", "#4f646f", "#8474ad", "#3c4042"],
  google: ["#ffffff", "#dadce0", "#1a73e8", "#ea4335", "#202124"],
  ink:    ["#121417", "#34383e", "#c48e5a", "#90a9b7", "#e8e2d4"],
};

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("sand");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  // Close popover on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const triggerClass = compact
    ? "inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted transition"
    : "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition";

  // Mini palette dot stack — three swatches stacked diagonally.
  const renderTriad = (t: Theme) => {
    const [bg, , primary, accent] = THEME_SWATCHES[t];
    return (
      <span
        className="relative inline-block h-5 w-5 rounded-full border border-border shrink-0 overflow-hidden"
        aria-hidden
      >
        <span
          className="absolute inset-0"
          style={{ background: bg }}
        />
        <span
          className="absolute right-0 top-0 h-full w-1/2"
          style={{ background: primary }}
        />
        <span
          className="absolute right-0 bottom-0 h-1/2 w-full"
          style={{ background: accent }}
        />
      </span>
    );
  };

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Theme"
        className={triggerClass}
        suppressHydrationWarning
      >
        <span aria-hidden className="inline-block h-5 w-5 rounded-full border border-border bg-muted" />
        {!compact && <span>Theme</span>}
      </button>
    );
  }

  return (
    <div ref={containerRef} className={compact ? "relative" : "relative w-full"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${THEME_LABEL[theme]}. Click to choose.`}
        className={triggerClass}
        title={`Theme: ${THEME_LABEL[theme]}`}
      >
        {renderTriad(theme)}
        {!compact && (
          <span className="flex-1 text-left">{THEME_LABEL[theme]} theme</span>
        )}
        {!compact && (
          <span className="text-xs opacity-60" aria-hidden>
            ▾
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose theme"
          className={
            (compact
              ? "absolute right-0 top-full mt-2 w-64 "
              : "absolute left-0 right-0 top-full mt-2 ") +
            "z-50 rounded-xl border border-border bg-card shadow-lg p-1.5"
          }
        >
          <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Theme
          </div>
          {THEMES.map((t) => {
            const active = t === theme;
            const swatches = THEME_SWATCHES[t];
            return (
              <button
                key={t}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(t)}
                className={
                  "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition " +
                  (active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <span className="flex items-center -space-x-1 shrink-0">
                  {swatches.map((c, i) => (
                    <span
                      key={i}
                      className="inline-block h-4 w-4 rounded-full border border-border/60"
                      style={{ background: c }}
                      aria-hidden
                    />
                  ))}
                </span>
                <span className="flex-1 text-left font-medium">
                  {THEME_LABEL[t]}
                </span>
                {active && (
                  <span className="text-[10px] uppercase tracking-wider text-foreground/70">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
