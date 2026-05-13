"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "breakdown" | "form";

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

function formatInt(value: number) {
  return value.toLocaleString();
}

function formatMaybe(value: number | null, formatter: (n: number) => string) {
  return value === null ? "—" : formatter(value);
}

function ScoreCard({
  title,
  subtitle,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  leftData,
  rightData,
  format = formatInt,
}: {
  title: string;
  subtitle: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  leftData: boolean;
  rightData: boolean;
  format?: (n: number) => string;
}) {
  const leftDisplay = formatMaybe(leftData ? leftValue : null, format);
  const rightDisplay = formatMaybe(rightData ? rightValue : null, format);
  const leftRaw = leftData ? leftValue : 0;
  const rightRaw = rightData ? rightValue : 0;
  const max = Math.max(leftRaw, rightRaw, 1);
  const leftPercent = leftData ? (leftRaw / max) * 100 : 0;
  const rightPercent = rightData ? (rightRaw / max) * 100 : 0;
  const leftWins = leftData && rightData && leftRaw > rightRaw;
  const rightWins = leftData && rightData && rightRaw > leftRaw;
  const tied = leftData && rightData && leftRaw === rightRaw;

  const leader = !leftData && !rightData ? "No data" : tied ? "Even" : leftWins ? leftLabel : rightLabel;

  return (
    <Card className="overflow-hidden border border-border/60 p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <span className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {leader}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={cn("rounded-2xl p-3", leftWins && "bg-success/10") }>
          <p className="truncate text-xs font-medium text-muted-foreground">{leftLabel}</p>
          <p className={cn("mt-1 text-2xl font-semibold tracking-tight", leftWins && "text-success")}>{leftDisplay}</p>
        </div>
        <div className={cn("rounded-2xl p-3 text-right", rightWins && "bg-primary/10") }>
          <p className="truncate text-xs font-medium text-muted-foreground">{rightLabel}</p>
          <p className={cn("mt-1 text-2xl font-semibold tracking-tight", rightWins && "text-primary")}>{rightDisplay}</p>
        </div>
      </div>

      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn(
            "transition-all",
            leftWins ? "bg-success" : tied ? "bg-muted-foreground/60" : "bg-success/60",
            !leftData && "bg-muted-foreground/25"
          )}
          style={{ width: `${leftPercent}%` }}
        />
        <div
          className={cn(
            "transition-all",
            rightWins ? "bg-primary" : tied ? "bg-muted-foreground/60" : "bg-primary/60",
            !rightData && "bg-muted-foreground/25"
          )}
          style={{ width: `${rightPercent}%` }}
        />
      </div>
    </Card>
  );
}

function ComparisonRow({
  label,
  leftValue,
  rightValue,
  leftData,
  rightData,
  format,
}: {
  label: string;
  leftValue: number;
  rightValue: number;
  leftData: boolean;
  rightData: boolean;
  format?: (n: number) => string;
}) {
  const render = format ?? formatInt;
  const leftDisplay = formatMaybe(leftData ? leftValue : null, render);
  const rightDisplay = formatMaybe(rightData ? rightValue : null, render);
  const leftRaw = leftData ? leftValue : 0;
  const rightRaw = rightData ? rightValue : 0;
  const max = Math.max(leftRaw, rightRaw, 1);
  const leftPercent = leftData ? (leftRaw / max) * 100 : 0;
  const rightPercent = rightData ? (rightRaw / max) * 100 : 0;
  const leftWins = leftData && rightData && leftRaw > rightRaw;
  const rightWins = leftData && rightData && rightRaw > leftRaw;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{leftDisplay} vs {rightDisplay}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className={cn("rounded-xl p-3", leftWins && "bg-success/10") }>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Left</p>
          <p className={cn("mt-1 text-lg font-semibold", leftWins && "text-success")}>{leftDisplay}</p>
        </div>
        <div className={cn("rounded-xl p-3 text-right", rightWins && "bg-primary/10") }>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Right</p>
          <p className={cn("mt-1 text-lg font-semibold", rightWins && "text-primary")}>{rightDisplay}</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/60">
        <div className="flex h-full w-full">
          <div className={cn("transition-all bg-success/80", !leftData && "bg-muted-foreground/25", leftWins && "bg-success")} style={{ width: `${leftPercent}%` }} />
          <div className={cn("transition-all bg-primary/80", !rightData && "bg-muted-foreground/25", rightWins && "bg-primary")} style={{ width: `${rightPercent}%` }} />
        </div>
      </div>
    </div>
  );
}

function FormBars({ values, tone }: { values: number[]; tone: "left" | "right" }) {
  const max = Math.max(...values, 1);

  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3">
      {values.map((v, idx) => {
        const pct = Math.max((v / max) * 100, 10);
        return (
          <div key={idx} className="group flex flex-col items-stretch gap-2">
            <div className="flex h-28 items-end rounded-2xl border border-border/60 bg-muted/20 p-2">
              <div
                className={cn(
                  "w-full rounded-xl transition-all",
                  tone === "left" ? "bg-success/85 group-hover:bg-success" : "bg-primary/85 group-hover:bg-primary"
                )}
                style={{ height: `${pct}%` }}
              />
            </div>
            <div className="text-center text-xs font-medium text-muted-foreground">{v}</div>
          </div>
        );
      })}
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
  const [tab, setTab] = useState<TabKey>("overview");
  const meHasData = me.matches > 0;
  const opponentHasData = opponent.matches > 0;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "breakdown", label: "Point Sources" },
    { key: "form", label: "Recent Form" },
  ];

  const totalDelta = useMemo(() => me.totalPoints - opponent.totalPoints, [me.totalPoints, opponent.totalPoints]);
  const totalLeader = useMemo(() => {
    if (totalDelta === 0) return "Even";
    return totalDelta > 0 ? me.username : opponent.username;
  }, [me.username, opponent.username, totalDelta]);
  const totalDeltaLabel = totalDelta === 0 ? "Level on total points" : totalDelta > 0 ? `${me.username} leads by ${formatInt(totalDelta)}` : `${opponent.username} leads by ${formatInt(Math.abs(totalDelta))}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-xl md:p-6 lg:p-8">
      <Card className="mx-auto w-full max-w-6xl overflow-hidden border border-border/70 p-0 shadow-[0_30px_120px_rgba(0,0,0,0.4)]">
        <div className="bg-gradient-to-br from-primary/10 via-background to-accent/10 px-5 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Head-to-head comparison</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{me.username} vs {opponent.username}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                A cleaner view of total score, scoring mix, and recent trend strength, with no filler metrics when the underlying data is not available.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
            <Link href={`/players/${me.userId}`} className="group rounded-3xl border border-border/60 bg-background/90 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center gap-3">
                <UserAvatar src={me.avatar} name={me.username} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{me.username}</p>
                  <p className="text-sm text-muted-foreground">{me.matches > 0 ? `${me.matches} scored matches` : "No scored matches yet"}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-success/10 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total points</p>
                  <p className="mt-1 text-xl font-semibold text-success">{formatInt(me.totalPoints)}</p>
                </div>
                <div className="rounded-2xl bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Consistency</p>
                  <p className="mt-1 text-xl font-semibold">{formatMaybe(meHasData ? me.consistency : null, (n) => n.toFixed(1))}</p>
                </div>
              </div>
            </Link>

            <div className="rounded-3xl border border-border/60 bg-background/90 p-4 text-center shadow-sm lg:min-w-[240px] lg:self-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Scoreboard</p>
              <p className="mt-4 text-4xl font-semibold tracking-tight">{totalDelta === 0 ? "—" : totalDelta > 0 ? `+${formatInt(totalDelta)}` : `-${formatInt(Math.abs(totalDelta))}`}</p>
              <p className="mt-2 text-sm text-muted-foreground">{totalDeltaLabel}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-left text-sm">
                <div className="rounded-2xl bg-success/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Leader</p>
                  <p className="mt-1 font-semibold text-success">{totalLeader}</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Match status</p>
                  <p className="mt-1 font-semibold text-primary">{meHasData || opponentHasData ? "Scored" : "Pending"}</p>
                </div>
              </div>
            </div>

            <Link href={`/players/${opponent.userId}`} className="group rounded-3xl border border-border/60 bg-background/90 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center gap-3">
                <UserAvatar src={opponent.avatar} name={opponent.username} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{opponent.username}</p>
                  <p className="text-sm text-muted-foreground">{opponent.matches > 0 ? `${opponent.matches} scored matches` : "No scored matches yet"}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-primary/10 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total points</p>
                  <p className="mt-1 text-xl font-semibold text-primary">{formatInt(opponent.totalPoints)}</p>
                </div>
                <div className="rounded-2xl bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Consistency</p>
                  <p className="mt-1 text-xl font-semibold">{formatMaybe(opponentHasData ? opponent.consistency : null, (n) => n.toFixed(1))}</p>
                </div>
              </div>
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Overall edge</p>
              <p className="mt-2 text-xl font-semibold">{totalLeader}</p>
              <p className="mt-1 text-sm text-muted-foreground">Highest total score</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Most consistent</p>
              <p className="mt-2 text-xl font-semibold">{meHasData && opponentHasData ? (me.consistency === opponent.consistency ? "Even" : me.consistency > opponent.consistency ? me.username : opponent.username) : "—"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Last 5-match average</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Best finish</p>
              <p className="mt-2 text-xl font-semibold">{meHasData && opponentHasData ? (me.maxPoints === opponent.maxPoints ? "Even" : me.maxPoints > opponent.maxPoints ? me.username : opponent.username) : "—"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Highest single-match score</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Data coverage</p>
              <p className="mt-2 text-xl font-semibold">{me.matches + opponent.matches > 0 ? "Available" : "None yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Comparison only shows real metrics</p>
            </div>
          </div>
        </div>

        <div className="border-b border-border bg-background/95 px-4 sm:px-6">
          <div className="flex gap-2 overflow-x-auto py-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition",
                  tab === t.key ? "bg-primary text-primary-foreground shadow-sm" : "border border-border/70 bg-background text-muted-foreground hover:bg-muted/50"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[58vh] overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          {tab === "overview" && (
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-2">
                <ScoreCard
                  title="Total points"
                  subtitle="The clearest headline metric in the comparison."
                  leftLabel={me.username}
                  rightLabel={opponent.username}
                  leftValue={me.totalPoints}
                  rightValue={opponent.totalPoints}
                  leftData={meHasData}
                  rightData={opponentHasData}
                />
                <ScoreCard
                  title="Average points per match"
                  subtitle="How efficiently each player turns matches into score."
                  leftLabel={me.username}
                  rightLabel={opponent.username}
                  leftValue={me.averagePointsPerMatch}
                  rightValue={opponent.averagePointsPerMatch}
                  leftData={meHasData}
                  rightData={opponentHasData}
                  format={(n) => n.toFixed(1)}
                />
                <ScoreCard
                  title="Win rate"
                  subtitle="Share of scored matches that finished first."
                  leftLabel={me.username}
                  rightLabel={opponent.username}
                  leftValue={me.winRate}
                  rightValue={opponent.winRate}
                  leftData={meHasData}
                  rightData={opponentHasData}
                  format={(n) => `${n.toFixed(1)}%`}
                />
                <ScoreCard
                  title="Podium rate"
                  subtitle="How often each player finishes in the top 3."
                  leftLabel={me.username}
                  rightLabel={opponent.username}
                  leftValue={me.podiumRate}
                  rightValue={opponent.podiumRate}
                  leftData={meHasData}
                  rightData={opponentHasData}
                  format={(n) => `${n.toFixed(1)}%`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border border-border/60 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Performance span</p>
                  <div className="mt-4 space-y-3">
                    <ComparisonRow label="Matches" leftValue={me.matches} rightValue={opponent.matches} leftData={meHasData} rightData={opponentHasData} />
                    <ComparisonRow label="Top 3 finishes" leftValue={me.top3} rightValue={opponent.top3} leftData={meHasData} rightData={opponentHasData} />
                    <ComparisonRow label="Average finish" leftValue={me.averageFinish} rightValue={opponent.averageFinish} leftData={meHasData} rightData={opponentHasData} format={(n) => n.toFixed(1)} />
                  </div>
                </Card>

                <Card className="border border-border/60 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ceiling and floor</p>
                  <div className="mt-4 space-y-3">
                    <ComparisonRow label="Best single match" leftValue={me.maxPoints} rightValue={opponent.maxPoints} leftData={meHasData} rightData={opponentHasData} />
                    <ComparisonRow label="Lowest scored match" leftValue={me.minPoints} rightValue={opponent.minPoints} leftData={meHasData} rightData={opponentHasData} />
                  </div>
                </Card>
              </div>

              <Card className="border border-border/60 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Comparison summary</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-success/10 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Leader</p>
                    <p className="mt-2 text-lg font-semibold text-success">{totalLeader}</p>
                  </div>
                  <div className="rounded-2xl bg-primary/10 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Edge</p>
                    <p className="mt-2 text-lg font-semibold text-primary">{totalDelta === 0 ? "Even" : totalDelta > 0 ? `+${formatInt(totalDelta)}` : `-${formatInt(Math.abs(totalDelta))}`}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Matches covered</p>
                    <p className="mt-2 text-lg font-semibold">{formatInt(me.matches + opponent.matches)}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Availability</p>
                    <p className="mt-2 text-lg font-semibold">{meHasData || opponentHasData ? "Ready" : "Empty"}</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {tab === "breakdown" && (
            <div className="space-y-5">
              <Card className="border border-border/60 p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Scoring mix</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  League points remain the base. Prediction, bonus, bounty, and rivalry points add or subtract from the final score.
                </p>
                <div className="mt-4 space-y-3">
                  <ComparisonRow label="League" leftValue={me.leaguePoints} rightValue={opponent.leaguePoints} leftData={meHasData} rightData={opponentHasData} />
                  <ComparisonRow label="Predictions" leftValue={me.predictionPoints} rightValue={opponent.predictionPoints} leftData={meHasData} rightData={opponentHasData} />
                  <ComparisonRow label="Bonus" leftValue={me.bonusPoints} rightValue={opponent.bonusPoints} leftData={meHasData} rightData={opponentHasData} />
                  <ComparisonRow label="Bounty" leftValue={me.bountyPoints} rightValue={opponent.bountyPoints} leftData={meHasData} rightData={opponentHasData} />
                  <ComparisonRow label="Rivalry" leftValue={me.rivalryPoints} rightValue={opponent.rivalryPoints} leftData={meHasData} rightData={opponentHasData} />
                  <ComparisonRow label="Penalty" leftValue={me.penaltyPoints} rightValue={opponent.penaltyPoints} leftData={meHasData} rightData={opponentHasData} />
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card className="border border-border/60 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Formula view</p>
                  <div className="mt-4 rounded-3xl border border-border/60 bg-background/80 p-4 text-sm leading-7 text-muted-foreground">
                    <span className="font-semibold text-foreground">Total score</span> = league + predictions + bonus + bounty + rivalry - penalty
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-2xl bg-muted/40 p-3">League is the match performance baseline.</div>
                      <div className="rounded-2xl bg-muted/40 p-3">Penalties are subtracted, so they are shown separately.</div>
                    </div>
                  </div>
                </Card>

                <Card className="border border-border/60 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">What matters most</p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="rounded-2xl bg-success/10 p-4">
                      <p className="font-semibold text-success">League score</p>
                      <p className="mt-1 text-muted-foreground">This is the primary backbone of the comparison.</p>
                    </div>
                    <div className="rounded-2xl bg-primary/10 p-4">
                      <p className="font-semibold text-primary">Prediction points</p>
                      <p className="mt-1 text-muted-foreground">Use this to see who converts pre-match reads more efficiently.</p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab === "form" && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border border-border/60 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{me.username}</p>
                  <p className="mt-2 text-3xl font-semibold">{formatMaybe(meHasData ? me.consistency : null, (n) => n.toFixed(1))}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Last 5-match average</p>
                </Card>
                <Card className="border border-border/60 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{opponent.username}</p>
                  <p className="mt-2 text-3xl font-semibold">{formatMaybe(opponentHasData ? opponent.consistency : null, (n) => n.toFixed(1))}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Last 5-match average</p>
                </Card>
                <Card className="border border-border/60 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recent form</p>
                  <p className="mt-2 text-3xl font-semibold">{formatInt(me.recentForm.length + opponent.recentForm.length)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Scored matches shown in the chart</p>
                </Card>
                <Card className="border border-border/60 p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Momentum</p>
                  <p className="mt-2 text-3xl font-semibold">{meHasData || opponentHasData ? "Live" : "Empty"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Recent results only, no filler rows</p>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border border-border/60 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{me.username}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Last 5 scored matches</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    {me.recentForm.length > 0 ? (
                      <FormBars values={me.recentForm} tone="left" />
                    ) : (
                      <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                        No recent matches available yet.
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="border border-border/60 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{opponent.username}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Last 5 scored matches</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    {opponent.recentForm.length > 0 ? (
                      <FormBars values={opponent.recentForm} tone="right" />
                    ) : (
                      <div className="rounded-3xl border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
                        No recent matches available yet.
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-background/95 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link href={`/players/${me.userId}`}>
              <Button size="sm" variant="outline" className="w-full sm:w-auto">
                View {me.username}
              </Button>
            </Link>
            <Link href={`/players/${opponent.userId}`}>
              <Button size="sm" variant="outline" className="w-full sm:w-auto">
                View {opponent.username}
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
