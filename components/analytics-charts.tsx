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

export function AnalyticsCharts({ data }: { data: Row[] }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-semibold mb-3">Total points by player</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272e" />
            <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} />
            <YAxis stroke="#a1a1aa" fontSize={12} />
            <Tooltip contentStyle={{ background: "#111117", border: "1px solid #27272e", borderRadius: 12 }} />
            <Legend />
            <Bar dataKey="total" fill="#f472b6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h2 className="font-semibold mb-3">Bonuses · penalties · predictions</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="#27272e" />
            <XAxis dataKey="name" stroke="#a1a1aa" fontSize={12} />
            <YAxis stroke="#a1a1aa" fontSize={12} />
            <Tooltip contentStyle={{ background: "#111117", border: "1px solid #27272e", borderRadius: 12 }} />
            <Legend />
            <Bar dataKey="bonus" stackId="a" fill="#22c55e" />
            <Bar dataKey="penalty" stackId="a" fill="#ef4444" />
            <Bar dataKey="predictions" stackId="a" fill="#38bdf8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
