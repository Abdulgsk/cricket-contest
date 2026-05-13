"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlayerCombobox } from "@/components/ui/player-combobox";
import { Spinner } from "@/components/ui/spinner";
import { PlayerComparison, type ComparisonStats } from "@/components/player-comparison";
import { ArrowRightLeft, Sparkles } from "lucide-react";

interface Player {
  _id: string;
  username: string;
}

interface CompareButtonProps {
  meId: string;
  players: Player[];
  variant?: "card" | "inline";
}

export function CompareButton({ meId, players, variant = "card" }: CompareButtonProps) {
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [comparisonData, setComparisonData] = useState<{
    me: ComparisonStats;
    opponent: ComparisonStats;
  } | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const selectablePlayers = useMemo(
    () => players.filter((p) => p._id !== meId),
    [players, meId]
  );

  const selectableOptions = useMemo(
    () => selectablePlayers.map((player) => ({ value: player._id, label: player.username })),
    [selectablePlayers]
  );

  const selectedPlayerLabel = useMemo(
    () => selectableOptions.find((player) => player.value === selectedPlayerId)?.label ?? "",
    [selectableOptions, selectedPlayerId]
  );

  const handleCompare = async () => {
    if (!selectedPlayerId) return;
    setSelectOpen(false);
    setComparisonLoading(true);

    try {
      const res = await fetch(`/api/players/${selectedPlayerId}/comparison`);
      if (res.ok) {
        const data = await res.json();
        setComparisonData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setComparisonLoading(false);
    }
  };

  return (
    <>
      {variant === "card" ? (
        <Card className="relative overflow-hidden border-border/70 p-0 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
          <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="max-w-xl space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Head-to-head analysis
              </div>
              <h3 className="text-base font-semibold sm:text-lg">Compare your performance against another player</h3>
              <p className="text-sm text-muted-foreground">
                Open a side-by-side view of total points, efficiency, breakdown, and recent form.
              </p>
            </div>
            <Button onClick={() => setSelectOpen(true)} variant="glow" size="sm" className="w-full sm:w-auto">
              <ArrowRightLeft className="h-4 w-4" />
              Compare players
            </Button>
          </div>
        </Card>
      ) : (
        <Button onClick={() => setSelectOpen(true)} variant="glow" size="sm" className="w-full sm:w-auto">
          <ArrowRightLeft className="h-4 w-4" />
          Compare players
        </Button>
      )}

      {selectOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-xl">
          <div className="mx-auto flex min-h-full w-full max-w-4xl items-center">
            <Card className="w-full overflow-hidden border border-border/70 p-0 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
              <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-5 p-5 sm:p-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Compare players</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight">Choose a player to benchmark against.</h3>
                    <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                      The comparison opens a focused analytics view with score composition, recent consistency, and trend signals.
                    </p>
                  </div>

                  {selectableOptions.length > 0 ? (
                    <div className="space-y-3">
                      <label htmlFor="compare-player" className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Select player
                      </label>
                      <PlayerCombobox
                        value={selectedPlayerId}
                        onChange={setSelectedPlayerId}
                        players={[]}
                        options={selectableOptions}
                        placeholder="Search a player"
                      />
                      <p className="text-xs text-muted-foreground">
                        {selectedPlayerId
                          ? `Selected: ${selectedPlayerLabel}`
                          : "Use search to find a player quickly, especially when the list grows."}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                      No other players are available for comparison yet.
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (comparisonLoading) return;
                        setSelectOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCompare}
                      disabled={!selectedPlayerId || comparisonLoading || selectableOptions.length === 0}
                      loading={comparisonLoading}
                    >
                      Compare now
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border bg-gradient-to-br from-muted/30 via-background to-primary/10 p-5 sm:p-6 lg:border-l lg:border-t-0">
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">What you will see</p>
                      <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                        <div className="flex items-start gap-3">
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-success" />
                          <span>Points, match count, and scoring efficiency side by side.</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                          <span>League versus prediction contribution with clean visual weighting.</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent" />
                          <span>Recent form and consistency, so the comparison reflects momentum too.</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Best for</p>
                        <p className="mt-2 text-sm text-foreground">Understanding who is stronger overall and where the edge comes from.</p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Design goal</p>
                        <p className="mt-2 text-sm text-foreground">Fast to scan on mobile, spacious on desktop, and free of noisy empty fields.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {comparisonLoading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm border border-border/70 bg-background/95 shadow-2xl">
            <div className="flex items-center gap-3">
              <Spinner size={18} className="text-primary" />
              <div>
                <p className="text-sm font-semibold">Preparing comparison</p>
                <p className="text-xs text-muted-foreground">Loading latest metrics and trends...</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full w-2/3 bg-primary/70 animate-pulse" />
              </div>
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full w-1/2 bg-accent/60 animate-pulse" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {comparisonData && (
        <PlayerComparison
          me={comparisonData.me}
          opponent={comparisonData.opponent}
          onClose={() => {
            setComparisonData(null);
            setSelectedPlayerId("");
          }}
        />
      )}
    </>
  );
}
