"use client";
import { useTransition, useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { submitPredictionAction, loadMatchPlayersAction } from "@/actions/predictions";

export type PlayerInfo = { name: string; role?: string; keeper?: boolean };

function PlayerIcon({ role, keeper }: { role?: string; keeper?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs shrink-0">
      {keeper && <span title="Wicket-keeper">🧤</span>}
      {role === "BOWL" && <span title="Bowler">⚾</span>}
      {role === "BAT" && <span title="Batsman">🏏</span>}
      {role === "AR" && (
        <>
          <span title="All-rounder (bat)">🏏</span>
          <span title="All-rounder (bowl)">⚾</span>
        </>
      )}
    </span>
  );
}

export function PredictionForm({
  matchId,
  teamA,
  teamB,
  players: initialPlayers,
  playerInfo: initialPlayerInfo,
  initial,
}: {
  matchId: string;
  teamA: string;
  teamB: string;
  players?: string[];
  playerInfo?: PlayerInfo[];
  initial?: { winner: string; topBatter: string; topBowler: string };
}) {
  const [pending, start] = useTransition();
  const [winner, setWinner] = useState<string>(initial?.winner ?? teamA);
  const [players, setPlayers] = useState<string[]>(initialPlayers ?? []);
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo[]>(initialPlayerInfo ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!initial;

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await loadMatchPlayersAction(matchId);
    setLoading(false);
    if (r.ok) {
      setPlayers(r.players);
      setPlayerInfo(r.playerInfo ?? []);
      if (!r.cached) toast.success(`Loaded ${r.players.length} players`);
    } else {
      setError(r.error);
    }
  }, [matchId]);

  // Auto-load on first mount if not already provided.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          if (r.ok) toast.success(isEditing ? "Prediction updated 📝" : "Prediction submitted 🎯");
          else toast.error(r.error);
        });
      }}
      className="space-y-3"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <p className="text-xs text-muted-foreground">
        ✏️ You can update your prediction until the prediction window closes.
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
        <PlayerSelect name="topBatter" players={players} playerInfo={playerInfo} initial={initial?.topBatter} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="topBowler">Top Bowler</Label>
        <PlayerSelect name="topBowler" players={players} playerInfo={playerInfo} initial={initial?.topBowler} />
      </div>

      <Button variant="glow" className="w-full h-12 md:h-11" loading={pending}>
        {pending
          ? isEditing ? "Updating…" : "Locking…"
          : isEditing ? "📝 Update prediction" : "🎯 Submit prediction"}
      </Button>
    </form>
  );
}

function PlayerSelect({ name, players, playerInfo, initial }: { name: string; players: string[]; playerInfo?: PlayerInfo[]; initial?: string }) {
  const [v, setV] = useState(initial ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const infoMap = new Map((playerInfo ?? []).map((p) => [p.name, p]));
  const getInfo = (name: string) => infoMap.get(name);
  const sortedPlayers = [...players].sort((a, b) => a.localeCompare(b));
  const filteredPlayers = query.trim()
    ? sortedPlayers.filter((p) => p.toLowerCase().includes(query.trim().toLowerCase()))
    : sortedPlayers;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) {
      setDropdownRect(null);
      return;
    }
    const updateRect = () => {
      if (wrapperRef.current) {
        setDropdownRect(wrapperRef.current.getBoundingClientRect());
      }
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  const dropdownContent = open && dropdownRect ? (
    <div
      className="fixed z-[9999] rounded-xl border border-border bg-card p-2 shadow-xl space-y-2"
      style={{
        top: dropdownRect.bottom,
        left: dropdownRect.left,
        width: dropdownRect.width,
      }}
    >
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search player"
        className="h-9"
        autoFocus
      />
      <div className="max-h-52 overflow-auto space-y-1">
        {filteredPlayers.length ? (
          filteredPlayers.map((p) => {
            const info = getInfo(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setV(p);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full text-left rounded-lg px-2 py-1.5 text-sm transition flex items-center gap-2 ${
                  v === p ? "bg-primary/15 text-primary" : "hover:bg-muted"
                } ${info?.keeper ? "ring-1 ring-warning/40" : ""}`}
              >
                <PlayerIcon role={info?.role} keeper={info?.keeper} />
                <span className="flex-1 truncate">{p}</span>
              </button>
            );
          })
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No players found.</div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <input type="hidden" name={name} value={v} required />
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="h-12 md:h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-left flex items-center justify-between gap-2"
        >
          <span className={`flex items-center gap-2 min-w-0 ${v ? "text-foreground" : "text-muted-foreground"}`}>
            {v && <PlayerIcon role={getInfo(v)?.role} keeper={getInfo(v)?.keeper} />}
            <span className="truncate">{v || "— pick a player —"}</span>
          </span>
          <span className="text-muted-foreground">▾</span>
        </button>
      </div>
      {createPortal(dropdownContent, document.body)}
    </>
  );
}
