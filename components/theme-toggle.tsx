"use client";

import { useEffect, useState } from "react";
import {
  THEMES,
  THEME_LABEL,
  THEME_ICON,
  applyTheme,
  readStoredTheme,
  type Theme,
} from "@/components/theme-init";

function nextTheme(current: Theme): Theme {
  const i = THEMES.indexOf(current);
  return THEMES[(i + 1) % THEMES.length];
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  // Avoid hydration mismatch: render a neutral placeholder on the server and
  // the first client render, then sync with the document on mount.
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("sand");

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  const cycle = () => {
    const next = nextTheme(theme);
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  };

  const baseClass = compact
    ? "inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted transition"
    : "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition";

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Cycle theme"
        className={baseClass}
        suppressHydrationWarning
      >
        <span aria-hidden>🎨</span>
        {!compact && <span>Theme</span>}
      </button>
    );
  }

  const upcoming = nextTheme(theme);
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Click to switch to ${THEME_LABEL[upcoming]}`}
      className={baseClass}
      title={`Theme: ${THEME_LABEL[theme]} → ${THEME_LABEL[upcoming]}`}
    >
      <span aria-hidden>{THEME_ICON[theme]}</span>
      {!compact && (
        <span>
          {THEME_LABEL[theme]} theme
        </span>
      )}
    </button>
  );
}
