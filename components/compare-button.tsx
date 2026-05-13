"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlayerComparison, type ComparisonStats } from "@/components/player-comparison";

interface Player {
  _id: string;
  username: string;
  avatar?: string | null;
}

interface CompareButtonProps {
  meId: string;
}

export function CompareButton({ meId }: CompareButtonProps) {
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [comparisonData, setComparisonData] = useState<{
    me: ComparisonStats;
    opponent: ComparisonStats;
  } | null>(null);

  const handleSearch = async (query: string) => {
    setSearchTerm(query);
    if (query.length < 2) {
      setPlayers([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.filter((p: Player) => p._id !== meId));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlayer = async (playerId: string) => {
    try {
      const res = await fetch(`/api/players/${playerId}/comparison`);
      if (res.ok) {
        const data = await res.json();
        setComparisonData(data);
        setShowSelectModal(false);
        setSearchTerm("");
        setPlayers([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button onClick={() => setShowSelectModal(true)} variant="outline" size="sm">
          Compare with Player
        </Button>
      </div>

      {/* Select Modal */}
      {showSelectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md space-y-4 p-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Select a player to compare</h3>
              <button
                type="button"
                onClick={() => {
                  setShowSelectModal(false);
                  setSearchTerm("");
                  setPlayers([]);
                }}
                className="text-muted-foreground hover:text-foreground text-2xl leading-none"
              >
                ✕
              </button>
            </div>
            <Input
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {loading && <div className="text-sm text-muted-foreground">Loading...</div>}
              {players.length === 0 && searchTerm && !loading && (
                <div className="text-sm text-muted-foreground">No players found</div>
              )}
              {players.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => handleSelectPlayer(p._id)}
                  className="w-full text-left px-2 py-2 rounded hover:bg-muted transition"
                >
                  <div className="font-medium">{p.username}</div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Comparison Modal */}
      {comparisonData && (
        <PlayerComparison
          me={comparisonData.me}
          opponent={comparisonData.opponent}
          onClose={() => setComparisonData(null)}
        />
      )}
    </>
  );
}
