"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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
  league: number;
  prediction: number;
  bonus: number;
  penalty: number;
  /** Rank in the match (1 best, 13 worst, 0 if missed) */
  rank: number;
  /** Cumulative league points up to and including this match */
  cumulative: number;
}

const tooltipStyle = {
  background: "#111117",
  border: "1px solid #27272e",
  borderRadius: 12,
  fontSize: 12,
};

const PIE_COLORS = ["#22c55e", "#ef4444", "#38bdf8", "#f472b6"];

export function PlayerCharts({
  data,
  totals,
}: {
  data: PlayerChartRow[];
  totals: { league: number; prediction: number; bonus: number; penalty: number };
}) {
  if (!data.length) return null;

  const breakdown = [
    { name: "League", value: totals.league },
    { name: "Predictions", value: totals.prediction },
    { name: "Bonus", value: totals.bonus },
    { name: "Penalty", value: Math.abs(totals.penalty) },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Cumulative points trend */}
      <div>
        <h3 className="font-semibold mb-2 text-sm">📈 Points over time</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f472b6" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#f472b6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272e" />
            <XAxis dataKey="label" stroke="#a1a1aa" fontSize={10} interval="preserveStartEnd" />
            <YAxis stroke="#a1a1aa" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="cumulative"
              name="Cumulative"
              stroke="#f472b6"
              strokeWidth={2}
              fill="url(#cumFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Per-match league vs prediction */}
      <div>
        <h3 className="font-semibold mb-2 text-sm">🎯 Per-match points</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272e" />
            <XAxis dataKey="label" stroke="#a1a1aa" fontSize={10} interval="preserveStartEnd" />
            <YAxis stroke="#a1a1aa" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="league" name="League" fill="#f472b6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="prediction" name="Prediction" fill="#38bdf8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Rank trend (only matches actually played) */}
      {data.some((d) => d.rank > 0) && (
        <div>
          <h3 className="font-semibold mb-2 text-sm">🏆 Match rank trend</h3>
          <p className="text-[11px] text-muted-foreground mb-1">Lower is better (1 = winner)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.filter((d) => d.rank > 0)} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272e" />
              <XAxis dataKey="label" stroke="#a1a1aa" fontSize={10} interval="preserveStartEnd" />
              <YAxis
                stroke="#a1a1aa"
                fontSize={11}
                reversed
                domain={[1, 13]}
                ticks={[1, 3, 5, 7, 9, 11, 13]}
                allowDecimals={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="rank"
                name="Rank"
                stroke="#facc15"
                strokeWidth={2}
                dot={{ r: 3, fill: "#facc15" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Points-source breakdown pie */}
      {breakdown.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2 text-sm">🥧 Where the points came from</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
              >
                {breakdown.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
