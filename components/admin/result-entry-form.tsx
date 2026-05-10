"use client";
import { useState, useTransition, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  submitResultsAction,
  checkMy11SessionAction,
  listMy11MatchesAction,
  listMy11ContestsAction,
  setMatchContestUrlAction,
} from "@/actions/admin";
import { loadMatchPlayersAction } from "@/actions/predictions";

interface UserRow {
  id: string;
  username: string;
  handle: string;
  my11circleName?: string;
  existing?: { rank: number; fp: number };
}

interface PoolRow {
  id: string;
  question: string;
  options: string[];
  scored: boolean;
  correctOption?: string;
}

export function ResultEntryForm({
  matchId,
  users,
  pools = [],
  teamA,
  teamB,
  players: initialPlayers = [],
  contestLinked = false,
  resultsEntered = false,
  isSuperadmin = false,
  existingPrediction = { winner: "", topBatter: "", topBowler: "" },
  existingScoreSummary = "",
}: {
  matchId: string;
  users: UserRow[];
  pools?: PoolRow[];
  teamA: string;
  teamB: string;
  players?: string[];
  contestLinked?: boolean;
  resultsEntered?: boolean;
  isSuperadmin?: boolean;
  existingPrediction?: { winner: string; topBatter: string; topBowler: string };
  existingScoreSummary?: string;
}) {
  const [editing, setEditing] = useState(!resultsEntered);
  const locked = resultsEntered && !editing;
  const [predWinner, setPredWinner] = useState(existingPrediction.winner);
  const [predBatter, setPredBatter] = useState(existingPrediction.topBatter);
  const [predBowler, setPredBowler] = useState(existingPrediction.topBowler);
  const [scoreSummary, setScoreSummary] = useState(existingScoreSummary);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [players, setPlayers] = useState<string[]>(initialPlayers);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [fetchingContestPoints, setFetchingContestPoints] = useState(false);
  const [my11Session, setMy11Session] = useState<{
    hasCookie: boolean;
    loggedIn: boolean;
    expiresAt: string | null;
  } | null>(null);

  // My11 contest picker
  type My11MatchOpt = {
    matchId: number;
    team1: string;
    team1Short: string;
    team2: string;
    team2Short: string;
    displayName: string;
    startTime: number | null;
    status: number | null;
    statusLabel: string;
    isJoined: boolean;
    seriesName: string;
  };
  type My11ContestOpt = {
    contestId: number;
    contestName: string;
    prizePool: number | null;
    joinedTeams: number | null;
    totalTeams: number | null;
  };
  const [my11Matches, setMy11Matches] = useState<My11MatchOpt[]>([]);
  const [my11Contests, setMy11Contests] = useState<My11ContestOpt[]>([]);
  const [pickedMatchId, setPickedMatchId] = useState<number | null>(null);
  const [pickedContestId, setPickedContestId] = useState<number | null>(null);
  const [loadingMy11Matches, setLoadingMy11Matches] = useState(false);
  const [loadingMy11Contests, setLoadingMy11Contests] = useState(false);
  const [savingContestUrl, setSavingContestUrl] = useState(false);

  const fetchPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    setPlayersError(null);
    const r = await loadMatchPlayersAction(matchId);
    setLoadingPlayers(false);
    if (r.ok) {
      setPlayers(r.players);
      if (!r.cached) toast.success(`Loaded ${r.players.length} players`);
    } else {
      setPlayersError(r.error);
    }
  }, [matchId]);

  useEffect(() => {
    if (!players.length) {
      const id = window.setTimeout(() => {
        void fetchPlayers();
      }, 0);
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [poolAnswers, setPoolAnswers] = useState<Record<string, string>>(
    Object.fromEntries(pools.map((p) => [p.id, p.correctOption ?? ""]))
  );
  const [rows, setRows] = useState(
    users.map((u) => ({
      ...u,
      fp: u.existing?.fp ?? 0,
    }))
  );

  const update = (id: string, value: number) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, fp: value } : r)));

  const clearAllPoints = () => {
    setRows((rs) => rs.map((r) => ({ ...r, fp: 0 })));
    toast.success("Cleared all fantasy points");
  };

  // Compute ranks from FP: descending. Equal FP → same rank. FP=0 → missed (rank 0).
  // Standard competition ranking (1, 2, 2, 4) so RANK_POINTS keep aligning.
  const rankByUser = (() => {
    const sorted = [...rows].filter((r) => r.fp > 0).sort((a, b) => b.fp - a.fp);
    const map = new Map<string, number>();
    let lastFp: number | null = null;
    let lastRank = 0;
    sorted.forEach((r, i) => {
      const rank = lastFp !== null && r.fp === lastFp ? lastRank : i + 1;
      map.set(r.id, rank);
      lastFp = r.fp;
      lastRank = rank;
    });
    return map;
  })();

  const submit = () => {
    if (!predWinner || !predBatter || !predBowler) {
      toast.error("Fill match prediction results first");
      return;
    }
    const customPoolResults = pools
      .filter((p) => poolAnswers[p.id])
      .map((p) => ({ poolId: p.id, correctOption: poolAnswers[p.id] }));
    start(async () => {
      const r = await submitResultsAction({
        matchId,
        predictionWinner: predWinner,
        predictionTopBatter: predBatter,
        predictionTopBowler: predBowler,
        scoreSummary: scoreSummary.trim() || undefined,
        customPoolResults,
        entries: rows.map((row) => ({
          userId: row.id,
          rank: rankByUser.get(row.id) ?? 0,
          fantasyPoints: Number(row.fp) || 0,
        })),
      });
      if (r?.ok) toast.success("Results processed · scoring engine ran");
      else toast.error(r?.error ?? "Failed");
    });
  };

  const fetchContestPoints = async () => {
    setFetchingContestPoints(true);
    try {
      const response = await fetch("/api/admin/fetch-my11-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        needsLogin?: boolean;
        entries?: Array<{
          userId: string;
          fantasyPoints: number;
          found: boolean;
        }>;
        usedCachedCookie?: boolean;
      };

      if (!response.ok) {
        if (data.needsLogin || response.status === 401) {
          toast.error(data.error || "Login required. Complete My11 login and retry.");
          return;
        }
        toast.error(data.error || "Failed to fetch");
        return;
      }

      const pointMap = new Map(
        (data.entries ?? []).map((entry) => [entry.userId, entry.fantasyPoints])
      );
      const foundCount = (data.entries ?? []).filter((entry) => entry.found).length;

      setRows((currentRows) =>
        currentRows.map((row) => ({
          ...row,
          fp: pointMap.get(row.id) ?? 0,
        }))
      );

      const cacheMsg = data.usedCachedCookie ? " (used cached session)" : " (new login)";
      toast.success(
        `Contest points loaded · matched ${foundCount}/${data.entries?.length ?? 0} players${cacheMsg}`
      );
    } finally {
      setFetchingContestPoints(false);
    }
  };

  const checkMy11Status = useCallback(async () => {
    try {
      const res = await checkMy11SessionAction();
      if (res.ok) {
        setMy11Session({
          hasCookie: res.hasCookie,
          loggedIn: res.loggedIn,
          expiresAt: res.expiresAt,
        });
      } else {
        setMy11Session(null);
      }
    } finally {
      // no-op
    }
  }, []);

  useEffect(() => {
    void checkMy11Status();
  }, [checkMy11Status]);

  const loadMy11Matches = async () => {
    setLoadingMy11Matches(true);
    try {
      const res = await listMy11MatchesAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Show IPL matches only (seriesId 3629 / tour name contains "Premier League")
      const iplOnly = res.matches.filter(
        (m) =>
          /indian t20 league|indian premier league/i.test(m.seriesName) ||
          /indian premier league/i.test(
            (m as unknown as { tourName?: string }).tourName ?? ""
          )
      );
      setMy11Matches(iplOnly.length ? iplOnly : res.matches);
      // Try to auto-select a match by team-name (full or short) match
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
      const a = norm(teamA);
      const b = norm(teamB);
      const matches = (n1: string, n2: string) => {
        const x = norm(n1);
        const y = norm(n2);
        const ax = a && x && (x.includes(a) || a.includes(x));
        const by = b && y && (y.includes(b) || b.includes(y));
        return ax && by;
      };
      const candidates = iplOnly.length ? iplOnly : res.matches;
      const auto = candidates.find(
        (m) =>
          matches(m.team1, m.team2) ||
          matches(m.team2, m.team1) ||
          matches(m.team1Short, m.team2Short) ||
          matches(m.team2Short, m.team1Short)
      );
      if (auto) {
        setPickedMatchId(auto.matchId);
        await loadMy11Contests(auto.matchId);
      } else {
        toast.success(`Loaded ${candidates.length} My11 matches`);
      }
    } finally {
      setLoadingMy11Matches(false);
    }
  };

  const loadMy11Contests = async (my11MatchId: number) => {
    setLoadingMy11Contests(true);
    setMy11Contests([]);
    setPickedContestId(null);
    try {
      const res = await listMy11ContestsAction(my11MatchId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setMy11Contests(res.contests);
      if (!res.contests.length) {
        toast.error("No joined contests found for this match");
      }
    } finally {
      setLoadingMy11Contests(false);
    }
  };

  const saveContestSelection = async () => {
    if (pickedMatchId == null || pickedContestId == null) {
      toast.error("Pick a match and contest first");
      return;
    }
    setSavingContestUrl(true);
    try {
      const url = `https://www.my11circle.com/lobby/contests/leaderboard/${pickedMatchId}/${pickedContestId}`;
      const res = await setMatchContestUrlAction(matchId, url);
      if (!res.ok) {
        toast.error("Failed to save contest URL");
        return;
      }
      toast.success("Contest URL saved. Now click Fetch My11 Points.");
      router.refresh();
    } finally {
      setSavingContestUrl(false);
    }
  };

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.localeCompare(b)),
    [players]
  );

  const hasPlayers = sortedPlayers.length > 0;

  if (locked) {
    const ranked = [...rows]
      .filter((r) => r.fp > 0)
      .sort((a, b) => b.fp - a.fp);
    return (
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              🔒 Results locked
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              This match has been scored. Edits are restricted to superadmins.
            </p>
          </div>
          {isSuperadmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Enable edit mode
            </Button>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-sm mb-4">
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Winner</div>
            <div className="font-semibold mt-1">{predWinner || "—"}</div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Top Batter</div>
            <div className="font-semibold mt-1">{predBatter || "—"}</div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Top Bowler</div>
            <div className="font-semibold mt-1">{predBowler || "—"}</div>
          </div>
        </div>

        {scoreSummary && (
          <p className="mb-4 text-xs text-muted-foreground">
            <strong>Summary:</strong> {scoreSummary}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="text-left">
                <th className="p-2 w-16">Rank</th>
                <th className="p-2">Player</th>
                <th className="p-2 w-24 text-right">FP</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="p-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-primary font-bold text-xs">
                      {i + 1}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="font-medium">{r.username}</div>
                    <div className="text-xs text-muted-foreground">@{r.handle}</div>
                  </td>
                  <td className="p-2 text-right font-semibold">{r.fp}</td>
                </tr>
              ))}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-muted-foreground">
                    No fantasy points recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {resultsEntered && editing && (
        <Card className="border border-warning/40 bg-warning/10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">✏️ Editing locked results</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Re-submitting will recompute scoring, bonuses and storyline facts.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      <Card>
        <h2 className="font-semibold mb-3">Actual prediction results</h2>
        <div className="space-y-3">
          <div>
            <Label>Match Winner</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {[teamA, teamB].map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setPredWinner(t)}
                  className={`rounded-xl px-3 py-3 text-sm font-semibold transition border ${
                    predWinner === t
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-muted/30 hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Top Batter</Label>
            <PlayerPicker
              value={predBatter}
              onChange={setPredBatter}
              players={sortedPlayers}
              disabled={!hasPlayers}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Top Bowler</Label>
            <PlayerPicker
              value={predBowler}
              onChange={setPredBowler}
              players={sortedPlayers}
              disabled={!hasPlayers}
            />
          </div>
        </div>
        {!hasPlayers && (
          <div className="mt-3 rounded-lg bg-muted/30 p-3 space-y-2 text-xs">
            {loadingPlayers ? (
              <span className="text-muted-foreground">⏳ Loading players…</span>
            ) : playersError ? (
              <>
                <div className="text-danger font-medium">Couldn&apos;t load players</div>
                <div className="text-muted-foreground break-words">{playersError}</div>
                <Button variant="outline" onClick={fetchPlayers}>Retry</Button>
              </>
            ) : (
              <Button variant="outline" onClick={fetchPlayers}>Load players</Button>
            )}
          </div>
        )}
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="scoreSummary">Score summary (optional)</Label>
          <Input
            id="scoreSummary"
            value={scoreSummary}
            onChange={(e) => setScoreSummary(e.target.value)}
            placeholder="e.g. RR 187/4 (20) beat GT 184/8 (20) by 6 wkts"
          />
        </div>
      </Card>

      {pools.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-3">Custom pool results</h2>
          <div className="space-y-3">
            {pools.map((p) => (
              <div key={p.id} className="rounded-xl bg-muted/30 p-3">
                <div className="text-sm font-medium mb-2">{p.question}</div>
                <select
                  className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm"
                  value={poolAnswers[p.id] ?? ""}
                  onChange={(e) => setPoolAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
                  disabled={p.scored}
                >
                  <option value="">— pick correct option —</option>
                  {p.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                {p.scored && (
                  <div className="text-xs text-success mt-1">✅ Already scored ({p.correctOption})</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">Per-player Dream11 entry</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Enter Dream11 fantasy points — ranks are auto-calculated (highest FP = rank 1; tied FP share rank). Leave at 0 to mark as missed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllPoints}
            >
              Clear All (0)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchContestPoints}
              loading={fetchingContestPoints}
              disabled={!contestLinked}
            >
              {fetchingContestPoints ? "Fetching…" : "🔄 Fetch My11 Points"}
            </Button>
          </div>
        </div>
        {!contestLinked && (
          <p className="mb-3 text-xs text-muted-foreground">
            No contest linked yet. Use the picker below or add a contest URL on the match.
          </p>
        )}

        <div className="mb-3 rounded-xl border border-border/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs">My11 Contest Picker</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadMy11Matches()}
              loading={loadingMy11Matches}
            >
              {my11Matches.length ? "Reload My11 matches" : "Load My11 matches"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pick a match (auto-matched by team names) → pick a contest you joined → save.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm"
              value={pickedMatchId ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setPickedMatchId(v);
                if (v != null) void loadMy11Contests(v);
                else setMy11Contests([]);
              }}
              disabled={!my11Matches.length}
            >
              <option value="">— pick My11 match —</option>
              {my11Matches.map((m) => (
                <option key={m.matchId} value={m.matchId}>
                  {m.displayName || `${m.team1Short || m.team1} vs ${m.team2Short || m.team2}`}
                  {m.statusLabel ? ` (${m.statusLabel})` : ""}
                  {m.isJoined ? " ★" : ""} · #{m.matchId}
                </option>
              ))}
            </select>
            <select
              className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm"
              value={pickedContestId ?? ""}
              onChange={(e) =>
                setPickedContestId(e.target.value ? Number(e.target.value) : null)
              }
              disabled={loadingMy11Contests || !my11Contests.length}
            >
              <option value="">
                {loadingMy11Contests
                  ? "loading contests…"
                  : my11Contests.length
                    ? "— pick contest —"
                    : "— pick a match first —"}
              </option>
              {my11Contests.map((c) => (
                <option key={c.contestId} value={c.contestId}>
                  {c.contestName || `Contest #${c.contestId}`}
                  {c.joinedTeams != null && c.totalTeams != null
                    ? ` · ${c.joinedTeams}/${c.totalTeams}`
                    : ""}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveContestSelection()}
            loading={savingContestUrl}
            disabled={pickedMatchId == null || pickedContestId == null}
          >
            Save selection as contest URL
          </Button>
        </div>

        {contestLinked && (
          <div className="mb-3 rounded-xl bg-blue-500/10 border border-blue-500/30 p-3 space-y-1.5">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">ℹ️ Direct My11 API</p>
            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
              Sync your My11 cookie via the browser extension first, then click Fetch Points.
            </p>
            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
              My11 session:{" "}
              {!my11Session
                ? "unknown"
                : !my11Session.hasCookie
                  ? "no cookie synced"
                  : my11Session.loggedIn
                    ? "active"
                    : "expired / logged out"}
              {my11Session?.expiresAt
                ? ` · expires ${new Date(my11Session.expiresAt).toLocaleString()}`
                : ""}
            </p>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr className="text-left">
              <th className="p-2 w-16">Rank</th>
              <th className="p-2">Player</th>
              <th className="p-2 w-32">Fantasy Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rank = rankByUser.get(r.id);
              return (
                <tr key={r.id} className="border-t border-border/40">
                  <td className="p-2">
                    {rank ? (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-sm">
                        {rank}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="font-medium">{r.username}</div>
                    <div className="text-xs text-muted-foreground">@{r.handle}</div>
                    {r.my11circleName ? (
                      <div className="text-[11px] text-muted-foreground">My11Circle: {r.my11circleName}</div>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={0}
                      value={r.fp}
                      onChange={(e) => update(r.id, Number(e.target.value))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-4">
          <Button variant="glow" onClick={submit} loading={pending}>
            {pending
              ? "Processing…"
              : resultsEntered
                ? "Save updated results"
                : "Process & publish results"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PlayerPicker({
  value,
  onChange,
  players,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  players: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const filtered = query.trim()
    ? players.filter((p) => p.toLowerCase().includes(query.trim().toLowerCase()))
    : players;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-left flex items-center justify-between disabled:opacity-60"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value || (disabled ? "Players not fetched yet" : "— pick a player —")}
        </span>
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card p-2 shadow-xl space-y-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player"
            className="h-9"
            autoFocus
          />
          <div className="max-h-52 overflow-auto space-y-1">
            {filtered.length ? (
              filtered.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full text-left rounded-lg px-2 py-1.5 text-sm transition ${
                    value === p ? "bg-primary/15 text-primary" : "hover:bg-muted"
                  }`}
                >
                  {p}
                </button>
              ))
            ) : (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No players found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
