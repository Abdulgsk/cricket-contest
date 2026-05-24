"use client";

/**
 * Auto-capture browser context for bug reports. Hooks the page's console
 * once at boot and keeps the last 20 errors in memory so that, when the
 * user opens the bug form, we can attach them automatically.
 */

type ConsoleErr = { at: string; msg: string };

declare global {
  interface Window {
    __bugCtxInited?: boolean;
    __bugErrors?: ConsoleErr[];
  }
}

function ensureBuffer(): ConsoleErr[] {
  if (typeof window === "undefined") return [];
  if (!window.__bugErrors) window.__bugErrors = [];
  return window.__bugErrors;
}

function push(msg: string) {
  const buf = ensureBuffer();
  buf.push({ at: new Date().toISOString(), msg: msg.slice(0, 2000) });
  while (buf.length > 20) buf.shift();
}

export function initBugContext() {
  if (typeof window === "undefined" || window.__bugCtxInited) return;
  window.__bugCtxInited = true;

  const origError = console.error;
  console.error = (...args: unknown[]) => {
    try {
      push(
        args
          .map((a) =>
            typeof a === "string"
              ? a
              : a instanceof Error
                ? `${a.name}: ${a.message}`
                : (() => {
                    try {
                      return JSON.stringify(a);
                    } catch {
                      return String(a);
                    }
                  })(),
          )
          .join(" "),
      );
    } catch {
      /* ignore */
    }
    origError.apply(console, args);
  };

  window.addEventListener("error", (e) => {
    push(`window.error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      const r = e.reason;
      push(
        `unhandledrejection: ${r instanceof Error ? r.message : typeof r === "string" ? r : JSON.stringify(r)}`,
      );
    } catch {
      push("unhandledrejection (unserializable)");
    }
  });
}

export function snapshotBrowserContext() {
  if (typeof window === "undefined") return null;
  let theme: string | null = null;
  try {
    const html = document.documentElement;
    theme = Array.from(html.classList).find((c) => c.startsWith("theme-")) ?? null;
  } catch {
    /* ignore */
  }
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio ?? 1,
    locale: typeof navigator !== "undefined" ? navigator.language : null,
    timezone:
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
    theme,
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    consoleErrors: ensureBuffer().slice(-20),
    buildId:
      typeof process !== "undefined"
        ? (process as { env?: Record<string, string | undefined> }).env?.NEXT_PUBLIC_BUILD_ID ?? null
        : null,
  };
}
