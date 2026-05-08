"use client";
import { useTransition, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { submitPredictionAction, loadMatchPlayersAction } from "@/actions/predictions";

export function PredictionForm({
  matchId,
  teamA,
  teamB,
  players: initialPlayers,
}: {
  matchId: string;
  teamA: string;
  teamB: string;
  players?: string[];
}) {
  const [pending, start] = useTransition();
  const [winner, setWinner] = useState<string>(teamA);
  const [players, setPlayers] = useState<string[]>(initialPlayers ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await loadMatchPlayersAction(matchId);
    setLoading(false);
    if (r.ok) {
      setPlayers(r.players);
      if (!r.cached) toast.success(`Loaded ${r.players.length} players`);
    } else {
      setError(r.error);
    }
  }, [matchId]);

  // Auto-load on first mount if not already provided.
  useEffect(() => {
    if (!players.length) void fetchPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasSquads = players.length > 0;

  if (!hasSquads) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 space-y-3 text-sm">
        {loading ? (
          <div className="text-muted-foreground">⏳ Loading players…</div>
        ) : error ? (
          <>
            <div className="text-danger font-medium">Couldn&apos;t load players</div>
            <div className="text-xs text-muted-foreground break-words">{error}</div>
            <Button variant="outline" onClick={fetchPlayers} disabled={loading}>
              Retry
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={fetchPlayers}>
            Load players
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        fd.set("winner", winner);
        start(async () => {
          const r = await submitPredictionAction(fd);
          if (r.ok) toast.success("Prediction locked in 🔒");
          else toast.error(r.error);
        });
      }}
      className="space-y-3"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <p className="text-xs text-warning">
        ⚠️ Once submitted, your prediction cannot be edited (admin can reset before match starts).
      </p>

      <div>
        <Label>Match Winner</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {[teamA, teamB].map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setWinner(t)}
              className={`rounded-xl px-3 py-3 text-sm font-semibold transition border ${
                winner === t
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
        <Label htmlFor="topBatter">Top Batter</Label>
        <PlayerSelect name="topBatter" players={players} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="topBowler">Top Bowler</Label>
        <PlayerSelect name="topBowler" players={players} />
      </div>

      <Button variant="glow" className="w-full h-12 md:h-11" loading={pending}>
        {pending ? "Locking…" : "🔒 Lock my prediction"}
      </Button>
    </form>
  );
}

function PlayerSelect({ name, players }: { name: string; players: string[] }) {
  const [v, setV] = useState("");
  return (
    <>
      <input type="hidden" name={name} value={v} required />
      <select
        className="h-12 md:h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
        value={v}
        onChange={(e) => setV(e.target.value)}
        required
      >
        <option value="">— pick a player —</option>
        {players.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </>
  );
}
