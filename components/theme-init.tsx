"use client";

import { useEffect } from "react";

export const THEMES = ["sand", "paper", "mist", "halo", "ink"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = {
  sand: "Sand",
  paper: "Paper",
  mist: "Mist",
  halo: "Halo",
  ink: "Ink",
};
export const THEME_ICON: Record<Theme, string> = {
  sand: "🏜️",
  paper: "📜",
  mist: "🌫️",
  halo: "🔍",
  ink: "🖋️",
};

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const t of THEMES) root.classList.remove(`theme-${t}`);
  root.classList.add(`theme-${theme}`);
  // Ink is the only dark theme — keep `dark` class so existing Tailwind
  // `dark:` utilities continue to apply.
  root.classList.toggle("dark", theme === "ink");
}

export function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    if (
      t === "sand" ||
      t === "paper" ||
      t === "mist" ||
      t === "halo" ||
      t === "ink"
    ) {
      return t;
    }
    // Migrate legacy values.
    if (t === "dark" || t === "wine") return "ink";
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
