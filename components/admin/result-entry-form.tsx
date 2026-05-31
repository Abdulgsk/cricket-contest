"use client";
import { useState, useTransition, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PlayerCombobox } from "@/components/ui/player-combobox";
import { submitResultsAction } from "@/actions/admin";
import {
  recomputeFantasyAction,
  loadFantasyLeaderboardAction,
} from "@/actions/fantasy-team";
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
  playerInfo: initialPlayerInfo = [],
  resultsEntered = false,
  isSuperadmin = false,
  existingPrediction = { winner: "", topBatter: "", topBowler: "" },
  existingScoreSummary = "",
  existingWrappedEnabled = false,
}: {
  matchId: string;
  users: UserRow[];
  pools?: PoolRow[];
  teamA: string;
  teamB: string;
  players?: string[];
  playerInfo?: Array<{ name: string; role?: string; keeper?: boolean }>;
  resultsEntered?: boolean;
  isSuperadmin?: boolean;
  existingPrediction?: { winner: string; topBatter: string; topBowler: string };
  existingScoreSummary?: string;
  existingWrappedEnabled?: boolean;
}) {
  const [editing, setEditing] = useState(!resultsEntered);
  const locked = resultsEntered && !editing;
  const [predWinner, setPredWinner] = useState(existingPrediction.winner);
  const [predBatter, setPredBatter] = useState(existingPrediction.topBatter);
  const [predBowler, setPredBowler] = useState(existingPrediction.topBowler);
  const [scoreSummary, setScoreSummary] = useState(existingScoreSummary);
  const [wrappedEnabled, setWrappedEnabled] = useState(existingWrappedEnabled);
  const [pending, start] = useTransition();
  const [players, setPlayers] = useState<string[]>(initialPlayers);
  const [playerInfo, setPlayerInfo] = useState<Array<{ name: string; role?: string; keeper?: boolean }>>(initialPlayerInfo);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [fetchingContestPoints, setFetchingContestPoints] = useState(false);
  const [fetchContestStatus, setFetchContestStatus] = useState<string | null>(null);

  const fetchPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    setPlayersError(null);
    const r = await loadMatchPlayersAction(matchId);
    setLoadingPlayers(false);
    if (r.ok) {
      setPlayers(r.players);
      setPlayerInfo(r.playerInfo ?? []);
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
    // Force the admin to either pick a correct option for every unscored pool,
    // or explicitly confirm they want to publish without scoring it. Empty
    // answers used to be silently skipped, which left members hanging.
    const missingPools = pools.filter(
      (p) => !p.scored && !poolAnswers[p.id]?.trim(),
    );
    if (missingPools.length) {
      const names = missingPools.map((p) => `\u2022 ${p.question}`).join("\n");
      const proceed = window.confirm(
        `These custom pools have no correct option selected:\n\n${names}\n\n` +
          `Click OK to publish results WITHOUT scoring them (you can edit and ` +
          `score later), or Cancel to go back and pick an answer.`,
      );
      if (!proceed) {
        toast.error("Pick a correct option for each pool before submitting");
        return;
      }
    }
    // Validate that every chosen answer is one of the pool's actual options.
    const invalidPool = pools.find((p) => {
      const ans = poolAnswers[p.id]?.trim();
      return ans && !p.options.includes(ans);
    });
    if (invalidPool) {
      toast.error(
        `Pool "${invalidPool.question}": pick one of the configured options`,
      );
      return;
    }
    if (resultsEntered) {
      const ok = window.confirm(
        "Re-publishing recomputes scoring, bonuses, rivalries and Civil War " +
          "points for this match. Continue?",
      );
      if (!ok) return;
    }
    const customPoolResults = pools
      .filter((p) => poolAnswers[p.id]?.trim())
      .map((p) => ({ poolId: p.id, correctOption: poolAnswers[p.id].trim() }));
    start(async () => {
      const r = await submitResultsAction({
        matchId,
        predictionWinner: predWinner,
        predictionTopBatter: predBatter,
        predictionTopBowler: predBowler,
        scoreSummary: scoreSummary.trim() || undefined,
        wrappedEnabled,
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

  // Pull fresh GullyXI fantasy points (computed in-app from the live
  // scorecard) and fill the per-player rows. No My11 mapping involved.
  const fetchContestPoints = async () => {
    setFetchingContestPoints(true);
    setFetchContestStatus("Computing fantasy points from the scorecard…");
    try {
      const recompute = await recomputeFantasyAction(matchId);
      if (!recompute.ok) {
        toast.error(recompute.error ?? "Could not compute points");
        setFetchContestStatus(recompute.error ?? "Failed");
        return;
      }
      if (!recompute.hasData) {
        toast.error("No scorecard data yet — try again once the match is scored.");
        setFetchContestStatus("No scorecard data yet");
        return;
      }

      setFetchContestStatus("Loading the fantasy leaderboard…");
      const board = await loadFantasyLeaderboardAction(matchId);
      if (!board.ok) {
        toast.error(board.error ?? "Could not load leaderboard");
        setFetchContestStatus(board.error ?? "Failed");
        return;
      }

      const pointMap = new Map(
        board.rows.map((r) => [r.userId, r.totalPoints]),
      );
      let matched = 0;
      setRows((currentRows) =>
        currentRows.map((row) => {
          const pts = pointMap.get(row.id);
          if (pts != null) matched += 1;
          return { ...row, fp: pts != null ? Math.round(pts) : row.fp };
        }),
      );

      toast.success(
        `Points loaded · matched ${matched}/${board.rows.length} teams`,
      );
      setFetchContestStatus(`Matched ${matched}/${board.rows.length} teams`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch points";
      toast.error(msg);
      setFetchContestStatus(msg);
    } finally {
      setFetchingContestPoints(false);
      window.setTimeout(() => setFetchContestStatus(null), 2500);
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
              This match has been scored. Editing will recompute the full leaderboard.
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
          {!isSuperadmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit results
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
            <PlayerCombobox
              value={predBatter}
              onChange={setPredBatter}
              players={sortedPlayers}
              playerInfo={playerInfo}
              disabled={!hasPlayers}
              placeholder={hasPlayers ? "— pick a player —" : "Players not fetched yet"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Top Bowler</Label>
            <PlayerCombobox
              value={predBowler}
              onChange={setPredBowler}
              players={sortedPlayers}
              playerInfo={playerInfo}
              disabled={!hasPlayers}
              placeholder={hasPlayers ? "— pick a player —" : "Players not fetched yet"}
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
        <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 p-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            checked={wrappedEnabled}
            onChange={(e) => setWrappedEnabled(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">Allow Wrapped</span>
            <span className="block text-xs text-muted-foreground">
              Show the GullyXI Wrapped recap on everyone&apos;s dashboard for
              this match. Leave off to keep it hidden.
            </span>
          </span>
        </label>
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
            >
              {fetchingContestPoints ? "Fetching points…" : "🔄 Fetch Points"}
            </Button>
          </div>
        </div>
        {fetchContestStatus && (
          <p className="mb-3 text-xs text-muted-foreground">{fetchContestStatus}</p>
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
