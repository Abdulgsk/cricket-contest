"use client";

import { useEffect } from "react";

export const THEMES = ["sand", "paper", "mist", "ink", "wine"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = {
  sand: "Sand",
  paper: "Paper",
  mist: "Mist",
  ink: "Ink",
  wine: "Wine",
};
export const THEME_ICON: Record<Theme, string> = {
  sand: "🏜️",
  paper: "📜",
  mist: "🌫️",
  ink: "🖋️",
  wine: "🍷",
};

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const t of THEMES) root.classList.remove(`theme-${t}`);
  root.classList.add(`theme-${theme}`);
  // Dark themes (wine, ink) keep the `dark` class so existing Tailwind
  // `dark:` utilities continue to apply.
  root.classList.toggle("dark", theme === "wine" || theme === "ink");
}

export function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    if (
      t === "sand" ||
      t === "paper" ||
      t === "mist" ||
      t === "ink" ||
      t === "wine"
    ) {
      return t;
    }
    // Migrate the old light/dark values.
    if (t === "dark") return "wine";
    if (t === "light") return "sand";
  } catch {
    /* ignore */
  }
  return "sand";
}

export function ThemeInit() {
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  return null;
}
