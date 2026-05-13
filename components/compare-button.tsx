"use client";

import { useState, useRef, useEffect } from "react";
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
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [comparisonData, setComparisonData] = useState<{
    me: ComparisonStats;
    opponent: ComparisonStats;
  } | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleSelectPlayer = async (playerId: string, playerName: string) => {
    setSelecting(true);
    setComparisonLoading(true);
    setIsOpen(false);
    setSearchTerm("");
    setPlayers([]);

    try {
      const res = await fetch(`/api/players/${playerId}/comparison`);
      if (res.ok) {
        const data = await res.json();
        setComparisonData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setComparisonLoading(false);
      setSelecting(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <div ref={dropdownRef} className="relative inline-block w-full max-w-sm">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          variant="outline"
          size="sm"
          className="w-full justify-between"
        >
          Compare with Player
          <span className="text-xs opacity-60">▼</span>
        </Button>

        {isOpen && (
          <Card className="absolute top-full left-0 right-0 mt-2 w-full z-50 p-0 shadow-lg">
            <div className="p-3 border-b border-border space-y-3">
              <Input
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                autoFocus
                className="text-sm"
              />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {loading && (
                  <div className="text-sm text-muted-foreground p-2">
                    <div className="inline-block animate-spin">◌</div> Loading...
                  </div>
                )}
                {!loading && players.length === 0 && searchTerm && (
                  <div className="text-sm text-muted-foreground p-2">No players found</div>
                )}
                {!loading && players.length > 0 && (
                  <>
                    {players.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => handleSelectPlayer(p._id, p.username)}
                        disabled={selecting}
                        className="w-full text-left px-3 py-2 rounded hover:bg-muted transition disabled:opacity-50"
                      >
                        <div className="font-medium text-sm">{p.username}</div>
                      </button>
                    ))}
                  </>
                )}
                {!loading && searchTerm.length === 0 && (
                  <div className="text-sm text-muted-foreground p-2">
                    Type at least 2 characters to search
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Loading State */}
      {comparisonLoading && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <div className="inline-flex">
              <div className="text-4xl animate-spin">◌</div>
            </div>
            <p className="text-white font-medium">Loading comparison...</p>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {comparisonData && !comparisonLoading && (
        <PlayerComparison
          me={comparisonData.me}
          opponent={comparisonData.opponent}
          onClose={() => setComparisonData(null)}
        />
      )}
    </>
  );
}
