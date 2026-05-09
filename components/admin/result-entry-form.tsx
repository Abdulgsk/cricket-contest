"use client";
import { useState, useTransition, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { submitResultsAction } from "@/actions/admin";
import { loadMatchPlayersAction } from "@/actions/predictions";

interface UserRow {
  id: string;
  username: string;
  handle: string;
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
}: {
  matchId: string;
  users: UserRow[];
  pools?: PoolRow[];
  teamA: string;
  teamB: string;
  players?: string[];
}) {
  const [predWinner, setPredWinner] = useState("");
  const [predBatter, setPredBatter] = useState("");
  const [predBowler, setPredBowler] = useState("");
  const [scoreSummary, setScoreSummary] = useState("");
  const [pending, start] = useTransition();
  const [players, setPlayers] = useState<string[]>(initialPlayers);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!players.length) void fetchPlayers();
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

  const hasPlayers = players.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold mb-3">Actual prediction results</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Match Winner</Label>
            <select
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
              value={predWinner}
              onChange={(e) => setPredWinner(e.target.value)}
            >
              <option value="">— pick winner —</option>
              <option value={teamA}>{teamA}</option>
              <option value={teamB}>{teamB}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Top Batter</Label>
            <select
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm disabled:opacity-60"
              value={predBatter}
              onChange={(e) => setPredBatter(e.target.value)}
              disabled={!hasPlayers}
            >
              <option value="">{hasPlayers ? "— pick player —" : "Players not fetched yet"}</option>
              {players.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Top Bowler</Label>
            <select
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm disabled:opacity-60"
              value={predBowler}
              onChange={(e) => setPredBowler(e.target.value)}
              disabled={!hasPlayers}
            >
              <option value="">{hasPlayers ? "— pick player —" : "Players not fetched yet"}</option>
              {players.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
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
        <h2 className="font-semibold mb-3">Per-player Dream11 entry</h2>
        <p className="text-xs text-muted-foreground mb-2">
          Enter Dream11 fantasy points — ranks are auto-calculated (highest FP = rank 1; tied FP share rank). Leave at 0 to mark as missed.
        </p>
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
            {pending ? "Processing…" : "Process & publish results"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
