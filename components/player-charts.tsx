"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface PlayerChartRow {
  /** Short label like "MI vs CSK" */
  label: string;
  /** Match start time (ms) — used only for sorting upstream */
  date: number;
  /** Rank-table points (base only — already includes ×2 doublePoints if active) */
  rankPoints: number;
  /** Bonus pool + bounty combined (positive contributions outside rank) */
  bonus: number;
  /** Rivalry duel net (signed) */
  rivalry: number;
  /** Civil War base + captain duel combined (signed) */
  civilWar: number;
  /** Prediction points (winner / batter / bowler / sweep) */
  prediction: number;
  /** Custom-pool side-bet points */
  customPool: number;
  /** Penalty total (negative) */
  penalty: number;
  /** Rank in the match (1 best, 13 worst, 0 if missed) */
  rank: number;
  /** Cumulative total points up to and including this match */
  cumulative: number;
  /** Special-match flag labels active for this match (e.g. "×2 Double points"). */
  specials?: string[];
}

const chartTheme = {
  primary: "rgb(var(--primary))",
  accent: "rgb(var(--accent))",
  success: "rgb(var(--success))",
  warning: "rgb(var(--warning))",
  danger: "rgb(var(--danger))",
  border: "rgb(var(--border))",
  axis: "rgb(var(--muted-foreground))",
  tooltipBg: "rgb(var(--card))",
};

const tooltipStyle = {
  background: chartTheme.tooltipBg,
  border: `1px solid ${chartTheme.border}`,
  borderRadius: 12,
  fontSize: 12,
  color: "rgb(var(--foreground))",
};

export function PlayerCharts({
  data,
}: {
  data: PlayerChartRow[];
}) {
  if (!data.length) return null;

  const contributionData = data.map((row) => ({
    ...row,
    positiveRank: Math.max(row.rankPoints, 0),
    positiveBonus: Math.max(row.bonus, 0),
    positiveRivalry: Math.max(row.rivalry, 0),
    positiveCivilWar: Math.max(row.civilWar, 0),
    positivePrediction: Math.max(row.prediction, 0),
    positivePool: Math.max(row.customPool, 0),
    negativeRivalry: Math.abs(Math.min(row.rivalry, 0)),
    negativeCivilWar: Math.abs(Math.min(row.civilWar, 0)),
    negativePenalty: Math.abs(Math.min(row.penalty, 0)),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-2 text-sm">📈 Points over time</h3>
        <p className="mb-2 text-xs text-muted-foreground">A cleaner view of how total score moved match by match.</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.24} />
                <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.border} vertical={false} />
            <XAxis dataKey="label" stroke={chartTheme.axis} fontSize={10} interval="preserveStartEnd" tickLine={false} axisLine={false} />
            <YAxis stroke={chartTheme.axis} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="cumulative"
              name="Cumulative"
              stroke={chartTheme.primary}
              strokeWidth={2}
              fill="url(#cumFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-sm">🎯 Per-match breakdown</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Every points source stacked per match. Negative bars are penalties / losses.
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={contributionData} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.border} vertical={false} />
            <XAxis dataKey="label" stroke={chartTheme.axis} fontSize={10} interval="preserveStartEnd" tickLine={false} axisLine={false} />
            <YAxis stroke={chartTheme.axis} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="positiveRank" name="Rank" stackId="pos" fill={chartTheme.primary} radius={[0, 0, 0, 0]} />
            <Bar dataKey="positiveBonus" name="Bonus/Bounty" stackId="pos" fill={chartTheme.success} radius={[0, 0, 0, 0]} />
            <Bar dataKey="positiveRivalry" name="Rivalry" stackId="pos" fill={chartTheme.accent} radius={[0, 0, 0, 0]} />
            <Bar dataKey="positiveCivilWar" name="Civil War" stackId="pos" fill="rgb(var(--warning))" radius={[0, 0, 0, 0]} />
            <Bar dataKey="positivePrediction" name="Predictions" stackId="pos" fill="rgb(var(--info, var(--accent)))" radius={[0, 0, 0, 0]} />
            <Bar dataKey="positivePool" name="Custom pools" stackId="pos" fill="rgb(var(--success))" fillOpacity={0.55} radius={[4, 4, 0, 0]} />
            <Bar dataKey="negativeRivalry" name="Rivalry loss" stackId="neg" fill={chartTheme.danger} fillOpacity={0.5} radius={[0, 0, 0, 0]} />
            <Bar dataKey="negativeCivilWar" name="Civil War loss" stackId="neg" fill={chartTheme.danger} fillOpacity={0.7} radius={[0, 0, 0, 0]} />
            <Bar dataKey="negativePenalty" name="Penalty" stackId="neg" fill={chartTheme.danger} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.some((d) => d.rank > 0) && (
        <div>
          <h3 className="font-semibold mb-2 text-sm">🏆 Match rank trend</h3>
          <p className="text-[11px] text-muted-foreground mb-1">Lower is better (1 = winner)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.filter((d) => d.rank > 0)} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.border} vertical={false} />
              <XAxis dataKey="label" stroke={chartTheme.axis} fontSize={10} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis
                stroke={chartTheme.axis}
                fontSize={11}
                reversed
                domain={[1, 13]}
                ticks={[1, 3, 5, 7, 9, 11, 13]}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="rank"
                name="Rank"
                stroke={chartTheme.warning}
                strokeWidth={2}
                dot={{ r: 3, fill: chartTheme.warning }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
