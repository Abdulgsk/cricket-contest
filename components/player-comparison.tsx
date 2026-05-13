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
  averagePointsPerMatch: number;
  winRate: number;
  podiumRate: number;
  maxPoints: number;
  minPoints: number;
  recentForm: number[];
  consistency: number;
}

function StatRow({
  label,
  meVal,
  oppVal,
  format = (v: number) => String(v),
  barChart = false,
}: {
  label: string;
  meVal: number;
  oppVal: number;
  format?: (v: number) => string;
  barChart?: boolean;
}) {
  const meWins = meVal > oppVal;
  const equal = meVal === oppVal;
  const meDisplay = format(meVal);
  const oppDisplay = format(oppVal);
  const maxVal = Math.max(meVal, oppVal, 1);
  const mePercent = (meVal / maxVal) * 100;
  const oppPercent = (oppVal / maxVal) * 100;

  if (barChart) {
    return (
      <div className="space-y-2 py-3">
        <div className="flex justify-between text-sm font-medium">
          <span>{label}</span>
          <span className="text-muted-foreground text-xs">{meDisplay} vs {oppDisplay}</span>
        </div>
        <div className="flex gap-1 h-6 rounded overflow-hidden bg-muted/20">
          <div
            className={`transition-all ${meWins ? "bg-success" : equal ? "bg-muted" : "bg-muted"}`}
            style={{ width: `${mePercent}%` }}
            title={`Me: ${meDisplay}`}
          />
          <div
            className={`transition-all ${!meWins && !equal ? "bg-accent" : equal ? "bg-muted" : "bg-muted"}`}
            style={{ width: `${oppPercent}%` }}
            title={`Opponent: ${oppDisplay}`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4 items-center py-2 border-b border-border/50 last:border-0">
      <div className={`text-right font-medium text-sm ${meWins ? "text-success font-bold" : equal ? "text-muted-foreground" : ""}`}>
        {meDisplay}
      </div>
      <div className="text-center text-muted-foreground font-medium text-xs uppercase">{label}</div>
      <div className={`text-left font-medium text-sm ${!meWins && !equal ? "text-accent font-bold" : equal ? "text-muted-foreground" : ""}`}>
        {oppDisplay}
      </div>
    </div>
  );
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
  const [activeTab, setActiveTab] = useState<"overview" | "breakdown" | "form">("overview");

  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "breakdown", label: "Points Breakdown", icon: "📈" },
    { id: "form", label: "Recent Form", icon: "🔥" },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-0">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Player Comparison</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Player Headers */}
        <div className="p-4 border-b border-border">
          <div className="grid grid-cols-3 gap-4 items-center">
            <Link
              href={`/players/${me.userId}`}
              className="text-center hover:opacity-80 transition"
            >
              <UserAvatar src={me.avatar} name={me.username} size={64} />
              <div className="font-bold text-sm mt-2 line-clamp-1">{me.username}</div>
            </Link>

            <div className="text-center">
              <div className="text-xs text-muted-foreground font-medium uppercase">VS</div>
              <div className="text-2xl font-bold text-muted-foreground mt-1">⚔️</div>
            </div>

            <Link
              href={`/players/${opponent.userId}`}
              className="text-center hover:opacity-80 transition"
            >
              <UserAvatar src={opponent.avatar} name={opponent.username} size={64} />
              <div className="font-bold text-sm mt-2 line-clamp-1">{opponent.username}</div>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Top Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-success/10 p-4 border border-success/20">
                  <div className="text-2xl font-bold text-success">{me.totalPoints}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Points</div>
                </div>
                <div className="rounded-lg bg-accent/10 p-4 border border-accent/20">
                  <div className="text-2xl font-bold text-accent">{opponent.totalPoints}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Points</div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm uppercase text-muted-foreground">Key Metrics</h3>
                <StatRow label="Matches" meVal={me.matches} oppVal={opponent.matches} barChart />
                <StatRow label="Win Rate" meVal={me.winRate} oppVal={opponent.winRate} format={(v) => `${v}%`} barChart />
                <StatRow label="Podium Rate" meVal={me.podiumRate} oppVal={opponent.podiumRate} format={(v) => `${v}%`} barChart />
                <StatRow label="Wins" meVal={me.wins} oppVal={opponent.wins} barChart />
                <StatRow label="2nd Place" meVal={me.silver} oppVal={opponent.silver} barChart />
                <StatRow label="3rd Place" meVal={me.bronze} oppVal={opponent.bronze} barChart />
                <StatRow label="Top 5" meVal={me.top5} oppVal={opponent.top5} barChart />
                <StatRow label="Avg Finish" meVal={me.averageFinish} oppVal={opponent.averageFinish} format={(v) => v.toFixed(1)} />
                <StatRow label="Avg Points/Match" meVal={me.averagePointsPerMatch} oppVal={opponent.averagePointsPerMatch} format={(v) => v.toFixed(1)} barChart />
              </div>

              {/* Performance Range */}
              <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                <h3 className="font-semibold text-sm">Performance Range</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Best Match</div>
                    <div className="font-bold text-success mt-1">{me.maxPoints} pts</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Best Match</div>
                    <div className="font-bold text-accent mt-1">{opponent.maxPoints} pts</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Worst Match</div>
                    <div className="font-bold text-danger mt-1">{me.minPoints} pts</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Worst Match</div>
                    <div className="font-bold text-danger mt-1">{opponent.minPoints} pts</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Points Breakdown Tab */}
          {activeTab === "breakdown" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                  <h3 className="font-semibold text-sm">League Points</h3>
                  <div className="text-2xl font-bold">{me.leaguePoints}</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Predictions:</span>
                      <span className="text-success">+{me.predictionPoints}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bonus:</span>
                      <span className="text-success">+{me.bonusPoints}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bounty:</span>
                      <span className="text-warning">+{me.bountyPoints}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rivalry:</span>
                      <span className="text-accent">+{me.rivalryPoints}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                      <span className="text-muted-foreground">Penalty:</span>
                      <span className="text-danger">−{me.penaltyPoints}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                  <h3 className="font-semibold text-sm">League Points</h3>
                  <div className="text-2xl font-bold">{opponent.leaguePoints}</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Predictions:</span>
                      <span className="text-success">+{opponent.predictionPoints}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bonus:</span>
                      <span className="text-success">+{opponent.bonusPoints}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bounty:</span>
                      <span className="text-warning">+{opponent.bountyPoints}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rivalry:</span>
                      <span className="text-accent">+{opponent.rivalryPoints}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                      <span className="text-muted-foreground">Penalty:</span>
                      <span className="text-danger">−{opponent.penaltyPoints}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Breakdown comparison */}
              <div className="space-y-3 bg-muted/20 p-4 rounded-lg">
                <h3 className="font-semibold text-sm uppercase">Point Sources Comparison</h3>
                <StatRow label="League" meVal={me.leaguePoints} oppVal={opponent.leaguePoints} barChart />
                <StatRow label="Predictions" meVal={me.predictionPoints} oppVal={opponent.predictionPoints} barChart />
                <StatRow label="Bonus" meVal={me.bonusPoints} oppVal={opponent.bonusPoints} barChart />
                <StatRow label="Bounty" meVal={me.bountyPoints} oppVal={opponent.bountyPoints} barChart />
                <StatRow label="Rivalry" meVal={me.rivalryPoints} oppVal={opponent.rivalryPoints} barChart />
                <StatRow label="Penalty" meVal={me.penaltyPoints} oppVal={opponent.penaltyPoints} barChart />
              </div>
            </div>
          )}

          {/* Recent Form Tab */}
          {activeTab === "form" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-sm mb-3">Consistency Score</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-success/10 p-4 border border-success/20">
                    <div className="text-2xl font-bold text-success">{me.consistency}</div>
                    <div className="text-xs text-muted-foreground mt-1">Last 5 Matches Avg</div>
                  </div>
                  <div className="rounded-lg bg-accent/10 p-4 border border-accent/20">
                    <div className="text-2xl font-bold text-accent">{opponent.consistency}</div>
                    <div className="text-xs text-muted-foreground mt-1">Last 5 Matches Avg</div>
                  </div>
                </div>
              </div>

              {/* Recent matches trend */}
              {me.recentForm.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-3">Last 5 Matches</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-2">Your Performance</div>
                      <div className="flex gap-2 h-12">
                        {me.recentForm.map((points, i) => {
                          const maxPoints = Math.max(...me.recentForm, ...opponent.recentForm, 1);
                          const height = (points / maxPoints) * 100;
                          return (
                            <div
                              key={i}
                              className="flex-1 rounded-sm bg-success/20 hover:bg-success/30 transition cursor-pointer relative group"
                              style={{ height: `${height}%` }}
                              title={`Match ${i + 1}: ${points} pts`}
                            >
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-foreground text-background text-xs px-2 py-1 rounded pointer-events-none">
                                {points} pts
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {opponent.recentForm.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-2">Opponent's Performance</div>
                        <div className="flex gap-2 h-12">
                          {opponent.recentForm.map((points, i) => {
                            const maxPoints = Math.max(...me.recentForm, ...opponent.recentForm, 1);
                            const height = (points / maxPoints) * 100;
                            return (
                              <div
                                key={i}
                                className="flex-1 rounded-sm bg-accent/20 hover:bg-accent/30 transition cursor-pointer relative group"
                                style={{ height: `${height}%` }}
                                title={`Match ${i + 1}: ${points} pts`}
                              >
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-foreground text-background text-xs px-2 py-1 rounded pointer-events-none">
                                  {points} pts
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border p-4 flex gap-2 justify-end sticky bottom-0 bg-card">
          <Link href={`/players/${me.userId}`}>
            <Button size="sm" variant="outline">
              View {me.username}
            </Button>
          </Link>
          <Link href={`/players/${opponent.userId}`}>
            <Button size="sm" variant="outline">
              View {opponent.username}
            </Button>
          </Link>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
