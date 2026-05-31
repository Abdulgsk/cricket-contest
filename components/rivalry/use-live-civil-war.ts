"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveMember = {
  userId: string;
  username: string;
  fantasyPoints: number;
  isCaptain: boolean;
  isMe: boolean;
  matched: boolean;
};

export type LiveTeam = {
  name: string;
  totalFp: number;
  captainFp: number;
  members: LiveMember[];
};

export type LiveAvailable = {
  ok: true;
  available: true;
  matchStatus: string;
  lastUpdated: string;
  teamA: LiveTeam;
  teamB: LiveTeam;
  leader: "A" | "B" | "tie";
  leadFp: number;
  winProb: { A: number; B: number };
  mySide: "A" | "B" | null;
};

export type LiveResponse =
  | LiveAvailable
  | {
      ok: true;
      available: false;
      reason:
        | "no_contest"
        | "not_started"
        | "auth_expired"
        | "not_ready"
        | "no_civil_war"
        | "bad_contest_url";
      matchStatus?: string;
    }
  | { ok: false; error: string };

const POLL_MS = 20_000;
const REFRESH_COOLDOWN_MS = 30_000;

export function useLiveCivilWar(matchId: string) {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // Throttle win% updates: only refresh the displayed % every 3rd successful poll.
  const pollCountRef = useRef(0);
  const stickyWinProbRef = useRef<{ A: number; B: number } | null>(null);

  const fetchOnce = useCallback(
    async (manual = false) => {
      if (!matchId) return;
      setRefreshing(true);
      try {
        const res = await fetch(`/api/civil-war/${matchId}/live`, {
          cache: "no-store",
        });
        const json = (await res.json()) as LiveResponse;
        if (json.ok && "available" in json && json.available) {
          pollCountRef.current += 1;
          const shouldRefreshWinProb =
            stickyWinProbRef.current === null ||
            manual ||
            pollCountRef.current % 3 === 1;
          if (shouldRefreshWinProb) {
            stickyWinProbRef.current = json.winProb;
          } else if (stickyWinProbRef.current) {
            json.winProb = stickyWinProbRef.current;
          }
        }
        setData(json);
        if (manual) setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
      } catch (e) {
        setData({ ok: false, error: e instanceof Error ? e.message : "Failed" });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [matchId]
  );

  useEffect(() => {
    if (!matchId) {
      setLoading(false);
      return;
    }
    fetchOnce();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchOnce();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") fetchOnce();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchOnce, matchId]);

  // 1s ticker so cooldown + "X seconds ago" stay fresh
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const cooldownLeftMs = Math.max(0, cooldownUntil - now);
  const canRefresh = !refreshing && cooldownLeftMs === 0;

  const refresh = useCallback(() => {
    if (!canRefresh) return;
    fetchOnce(true);
  }, [fetchOnce, canRefresh]);

  return {
    data,
    loading,
    refreshing,
    refresh,
    canRefresh,
    cooldownLeftMs,
    now,
  };
}
