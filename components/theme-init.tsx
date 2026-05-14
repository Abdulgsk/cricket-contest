"use client";

import { useEffect } from "react";

export const THEMES = ["sand", "mist", "wine"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABEL: Record<Theme, string> = {
  sand: "Sand",
  mist: "Mist",
  wine: "Wine",
};
export const THEME_ICON: Record<Theme, string> = {
  sand: "🏜️",
  mist: "🌫️",
  wine: "🍷",
};

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const t of THEMES) root.classList.remove(`theme-${t}`);
  root.classList.add(`theme-${theme}`);
  // Wine is the dark theme — keep `dark` class so existing Tailwind
  // `dark:` utilities continue to apply.
  root.classList.toggle("dark", theme === "wine");
}

export function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    if (t === "sand" || t === "mist" || t === "wine") return t;
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
