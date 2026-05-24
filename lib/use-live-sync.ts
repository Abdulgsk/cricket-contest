"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * useLiveSync — soft "realtime" without external infra.
 *
 * Strategy:
 *  - On mount, set up a `setInterval` that calls `router.refresh()` every
 *    `intervalMs` while the tab is **visible**.
 *  - Stop the timer while the document is hidden; force a refresh the moment
 *    visibility comes back.
 *  - Also refresh on window focus.
 *  - For 13 users this delivers near-live UX (≤ 10s lag) at zero infra cost.
 *
 * Future upgrade path (drop-in):
 *  - Wire `lib/realtime/pusher.ts` to subscribe to `bug.<id>` and call
 *    `router.refresh()` on every event instead of polling. The component API
 *    stays the same.
 */
export function useLiveSync({
  intervalMs = 10_000,
  enabled = true,
}: { intervalMs?: number; enabled?: boolean } = {}) {
  const router = useRouter();

  React.useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let last = Date.now();

    const refresh = () => {
      last = Date.now();
      router.refresh();
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        refresh();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - last > intervalMs) refresh();
        start();
      } else {
        stop();
      }
    };
    const onFocus = () => {
      if (Date.now() - last > 2000) refresh();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, enabled, router]);
}
