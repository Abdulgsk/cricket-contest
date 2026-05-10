"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getNextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  // Avoid hydration mismatch: render a neutral placeholder on the server and
  // the first client render, then sync with the document on mount.
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = getNextTheme(theme);
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  };

  const baseClass = compact
    ? "inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-card hover:bg-muted transition"
    : "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition";

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={baseClass}
        suppressHydrationWarning
      >
        <span aria-hidden>🌓</span>
        {!compact && <span>Theme</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className={baseClass}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
      {!compact && <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>}
    </button>
  );
}
