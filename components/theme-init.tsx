"use client";

import { useEffect } from "react";

export function ThemeInit() {
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "dark") document.documentElement.classList.add("dark");
      if (t === "light") document.documentElement.classList.remove("dark");
    } catch {
      // Ignore localStorage failures in restricted environments.
    }
  }, []);

  return null;
}
