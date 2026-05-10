"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Row {
  name: string;
  total: number;
  bonus: number;
  penalty: number;
  predictions: number;
}

const chartTheme = {
  primary: "rgb(var(--primary))",
  accent: "rgb(var(--accent))",
  success: "rgb(var(--success))",
  danger: "rgb(var(--danger))",
  border: "rgb(var(--border))",
  axis: "rgb(var(--muted-foreground))",
  tooltipBg: "rgb(var(--card))",
};

const tooltipStyle = {
  background: chartTheme.tooltipBg,
  border: `1px solid ${chartTheme.border}`,
  borderRadius: 12,
  color: "rgb(var(--foreground))",
};

export function AnalyticsCharts({ data }: { data: Row[] }) {
  const topPlayers = [...data]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-semibold mb-3">Total points by player</h2>
        <p className="mb-3 text-xs text-muted-foreground">A simpler top-player view so the leaderboard trend is easier to read.</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={topPlayers} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.border} vertical={false} />
            <XAxis dataKey="name" stroke={chartTheme.axis} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke={chartTheme.axis} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar dataKey="total" name="Total" fill={chartTheme.primary} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h2 className="font-semibold mb-3">Points mix</h2>
        <p className="mb-3 text-xs text-muted-foreground">Bonus, prediction, and penalty impact for the current top players.</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={topPlayers} stackOffset="sign" margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.border} vertical={false} />
            <XAxis dataKey="name" stroke={chartTheme.axis} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke={chartTheme.axis} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar dataKey="bonus" name="Bonus" stackId="a" fill={chartTheme.success} radius={[6, 6, 0, 0]} />
            <Bar dataKey="predictions" name="Predictions" stackId="a" fill={chartTheme.accent} radius={[6, 6, 0, 0]} />
            <Bar dataKey="penalty" name="Penalty" stackId="a" fill={chartTheme.danger} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
