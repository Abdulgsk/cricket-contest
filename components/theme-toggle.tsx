"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  // Close modal on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
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

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose theme"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            {/* Modal */}
            <div
              ref={dialogRef}
              className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="flex items-start justify-between px-5 pt-4 pb-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Choose a theme
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pick a palette — applies instantly across the app.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  aria-label="Close"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M3.5 3.5l9 9m0-9l-9 9"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 pt-2">
                {THEMES.map((t) => {
                  const active = t === theme;
                  const swatches = THEME_SWATCHES[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => choose(t)}
                      className={
                        "group flex flex-col gap-2 rounded-xl border p-3 text-left transition " +
                        (active
                          ? "border-primary/70 bg-muted ring-2 ring-primary/30"
                          : "border-border hover:border-primary/40 hover:bg-muted/60")
                      }
                    >
                      {/* Preview strip */}
                      <span
                        className="flex h-10 w-full overflow-hidden rounded-lg border border-border/60"
                        aria-hidden
                      >
                        {swatches.map((c, i) => (
                          <span
                            key={i}
                            className="flex-1"
                            style={{ background: c }}
                          />
                        ))}
                      </span>
                      <span className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">
                          {THEME_LABEL[t]}
                        </span>
                        {active && (
                          <span className="rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                            Active
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
