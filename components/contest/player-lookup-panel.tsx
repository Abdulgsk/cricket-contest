"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

type PlayerSearchResult = {
  id: string;
  my11Id: number;
  name: string;
  dName: string;
  role?: string;
  roleName?: string;
  teamId?: number | null;
  teamName?: string;
  imgURL?: string;
};

type Owner = {
  userId: string;
  username: string;
  handle: string;
  avatar: string | null;
  avatarColor: string | null;
  isCaptain: boolean;
  isViceCaptain: boolean;
  points: number;
};

type OwnershipResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      player: PlayerSearchResult;
      ownership: {
        holders: Owner[];
        captains: Owner[];
        viceCaptains: Owner[];
        skippedCount: number;
        totalMappedTeams: number;
      };
      refreshedAt: number;
    };

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function PlayerLookupPanel({
  matchId,
  refreshMs,
  enabled = true,
}: {
  matchId: string;
  /** Auto-refresh interval for the currently-selected player's ownership. */
  refreshMs?: number;
  /**
   * When false, render nothing. Driven by the
   * `playerDirectoryEnabled` Settings flag so superadmins can fall back to
   * the previous flow during a live match if anything misbehaves.
   */
  enabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PlayerSearchResult | null>(null);
  const [ownership, setOwnership] = useState<OwnershipResponse | null>(null);
  const [loadingOwnership, setLoadingOwnership] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial / debounced search.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = new URL(
          `/api/contests/${matchId}/players/search`,
          window.location.origin
        );
        url.searchParams.set("q", query);
        url.searchParams.set("limit", "20");
        const r = await fetch(url.toString(), { cache: "no-store" });
        const j = (await r.json()) as
          | { ok: true; players: PlayerSearchResult[] }
          | { ok: false; error: string };
        if (j.ok) setResults(j.players);
      } finally {
        setSearching(false);
      }
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, matchId]);

  const loadOwnership = useMemo(
    () => async (my11Id: number) => {
      setLoadingOwnership(true);
      try {
        const url = `/api/contests/${matchId}/players/ownership?my11Id=${my11Id}`;
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as OwnershipResponse;
        setOwnership(j);
      } finally {
        setLoadingOwnership(false);
      }
    },
    [matchId]
  );

  // Auto-refresh selected player ownership so impact-player swaps surface
  // without the user clicking refresh.
  useEffect(() => {
    if (!selected) return;
    loadOwnership(selected.my11Id);
    if (!refreshMs || refreshMs <= 0) return;
    const t = setInterval(() => loadOwnership(selected.my11Id), refreshMs);
    return () => clearInterval(t);
  }, [selected, refreshMs, loadOwnership]);

  function pickPlayer(p: PlayerSearchResult) {
    setSelected(p);
    setQuery(p.dName);
    setOpen(false);
  }

  function clearSelection() {
    setSelected(null);
    setOwnership(null);
    setQuery("");
    setOpen(true);
  }

  if (!enabled) return null;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">🔍 Player ownership</h3>
          <p className="text-[11px] text-muted-foreground">
            Find who picked a player and who made them C / VC. Live — refreshes
            with the team data.
          </p>
        </div>
        {selected && (
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Clear
          </Button>
        )}
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (selected && e.target.value !== selected.dName) setSelected(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search any player by name…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        {open && (
          <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-card shadow-lg">
            {searching ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Spinner /> Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                {query.trim()
                  ? "No players match — try a shorter query."
                  : "No players seen yet. Once a team is fetched, the directory fills up."}
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pickPlayer(p)}
                      className="flex w-full items-center justify-between gap-2 p-2 text-left hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {p.imgURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imgURL}
                            alt=""
                            className="h-8 w-8 rounded-full bg-muted object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {p.dName}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {p.roleName ?? p.role ?? "—"}
                            {p.teamName ? ` · ${p.teamName}` : ""}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-2">
            {selected.imgURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.imgURL}
                alt=""
                className="h-12 w-12 rounded-full bg-background object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-background" />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{selected.dName}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {selected.roleName ?? selected.role ?? "—"}
                {selected.teamName ? ` · ${selected.teamName}` : ""}
              </div>
            </div>
          </div>

          {loadingOwnership && !ownership ? (
            <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <Spinner /> Loading ownership…
            </div>
          ) : ownership && ownership.ok ? (
            <OwnershipBody data={ownership} matchId={matchId} />
          ) : ownership && !ownership.ok ? (
            <p className="p-2 text-xs text-danger">
              {ownership.error === "player_not_found"
                ? "Player not in our directory yet."
                : "Couldn't load ownership."}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function OwnershipBody({
  data,
  matchId,
}: {
  data: Extract<OwnershipResponse, { ok: true }>;
  matchId: string;
}) {
  const { holders, captains, viceCaptains, skippedCount, totalMappedTeams } =
    data.ownership;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <Stat label="Picked by" value={holders.length} hint={`of ${totalMappedTeams}`} />
        <Stat label="Captain" value={captains.length} accent="primary" />
        <Stat label="Vice-captain" value={viceCaptains.length} accent="muted" />
      </div>

      {holders.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
          Nobody picked this player.{" "}
          {skippedCount > 0 ? `${skippedCount} team(s) skipped them.` : ""}
        </p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-md border border-border/60">
          {holders.map((h) => (
            <li
              key={h.userId}
              className="flex items-center justify-between gap-2 p-2"
            >
              <Link
                href={`/contests/${matchId}/compare/${h.userId}`}
                className="flex min-w-0 items-center gap-2 hover:underline"
              >
                <UserAvatar src={h.avatar} name={h.username} size={28} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{h.username}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    @{h.handle}
                  </div>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                {h.isCaptain && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    C
                  </span>
                )}
                {h.isViceCaptain && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
                    VC
                  </span>
                )}
                <span className="tabular-nums text-xs font-bold">
                  {fmt(h.points)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.refreshedAt > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Last team refresh: {new Date(data.refreshedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: "primary" | "muted";
}) {
  const accentClass =
    accent === "primary"
      ? "text-primary"
      : accent === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${accentClass}`}>
        {value}
        {hint && (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}
