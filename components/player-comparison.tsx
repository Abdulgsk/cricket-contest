"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import Link from "next/link";

export interface ComparisonStats {
  userId: string;
  username: string;
  avatar?: string | null;
  totalPoints: number;
  leaguePoints: number;
  predictionPoints: number;
  bonusPoints: number;
  bountyPoints: number;
  rivalryPoints: number;
  penaltyPoints: number;
  matches: number;
  wins: number;
  silver: number;
  bronze: number;
  top3: number;
  top5: number;
  averageFinish: number;
}

export function PlayerComparison({
  me,
  opponent,
  onClose,
}: {
  me: ComparisonStats;
  opponent: ComparisonStats;
  onClose: () => void;
}) {
  const stats = [
    { label: "Total Points", key: "totalPoints", color: "text-primary" },
    { label: "League", key: "leaguePoints", color: "text-foreground" },
    { label: "Predictions", key: "predictionPoints", color: "text-accent" },
    { label: "Bonus", key: "bonusPoints", color: "text-success" },
    { label: "Bounty", key: "bountyPoints", color: "text-warning" },
    { label: "Rivalry", key: "rivalryPoints", color: "text-accent" },
    { label: "Penalty", key: "penaltyPoints", color: "text-danger" },
    { label: "Matches", key: "matches", color: "text-foreground" },
    { label: "Wins", key: "wins", color: "text-success" },
    { label: "2nd", key: "silver", color: "text-muted-foreground" },
    { label: "3rd", key: "bronze", color: "text-muted-foreground" },
    { label: "Top 3", key: "top3", color: "text-foreground" },
    { label: "Top 5", key: "top5", color: "text-foreground" },
    { label: "Avg Finish", key: "averageFinish", color: "text-foreground", format: (n: number) => n.toFixed(1) },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-4">
        <div className="sticky top-0 bg-card border-b border-border p-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">Player Comparison</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Player Headers */}
          <div className="grid grid-cols-2 gap-6">
            {[me, opponent].map((player) => (
              <div key={player.userId} className="text-center">
                <Link
                  href={`/players/${player.userId}`}
                  className="inline-block hover:opacity-80 transition"
                >
                  <UserAvatar src={player.avatar} name={player.username} size={64} />
                </Link>
                <Link
                  href={`/players/${player.userId}`}
                  className="block font-semibold mt-2 hover:text-primary"
                >
                  {player.username}
                </Link>
              </div>
            ))}
          </div>

          {/* Stats Grid */}
          <div className="space-y-2">
            {stats.map((stat) => {
              const meVal = (me as any)[stat.key];
              const oppVal = (opponent as any)[stat.key];
              const meDisplay = stat.format ? stat.format(meVal) : meVal;
              const oppDisplay = stat.format ? stat.format(oppVal) : oppVal;
              const meWins = meVal > oppVal;
              const oppWins = oppVal > meVal;

              return (
                <div key={stat.key} className="grid grid-cols-3 gap-4 items-center text-sm">
                  <div className={`text-right font-medium ${meWins ? "text-success font-bold" : ""} ${stat.color}`}>
                    {meDisplay}
                  </div>
                  <div className="text-center text-muted-foreground font-medium">{stat.label}</div>
                  <div className={`text-left font-medium ${oppWins ? "text-success font-bold" : ""} ${stat.color}`}>
                    {oppDisplay}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-center pt-4">
            <Link href={`/players/${me.userId}`}>
              <Button size="sm" variant="outline">
                View {me.username}'s Profile
              </Button>
            </Link>
            <Link href={`/players/${opponent.userId}`}>
              <Button size="sm" variant="outline">
                View {opponent.username}'s Profile
              </Button>
            </Link>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
