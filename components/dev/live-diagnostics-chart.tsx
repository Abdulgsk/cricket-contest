"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";

type OnlineUser = {
  userId: string;
  username: string;
  avatar: string | null;
  lastSeenAt: string | null;
};

type TickResponse = {
  t: number;
  cpuPct: number;
  uptimeSec: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; externalMb: number };
  mongo: { state: number };
  requestsPerMin: number;
  concurrentUsers: number;
  activeUsers5m: number;
  onlineUsers: OnlineUser[];
  counts: { users: number; matches: number; predictions: number; rivalries: number };
};

type Tick = {
  t: number;
  cpuPct: number;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
};

type MinuteTick = {
  t: number;
  concurrentUsers: number;
  requestsPerMin: number;
};

const MAX_POINTS = 60;
const POLL_MS = 2000;
const MINUTE_MS = 60_000;
const MAX_MINUTE_POINTS = 60;

export function LiveDiagnosticsChart() {
  const [ticks, setTicks] = React.useState<Tick[]>([]);
  const [minuteTicks, setMinuteTicks] = React.useState<MinuteTick[]>([]);
  const lastMinuteRef = React.useRef<number>(0);
  const [latestFull, setLatestFull] = React.useState<TickResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (paused) {
        timer = setTimeout(poll, POLL_MS);
        return;
      }
      try {
        const r = await fetch("/api/dev/diagnostics-tick", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as TickResponse;
        if (cancelled) return;
        setError(null);
        setLatestFull(j);
        setTicks((prev) => {
          const next: Tick = {
            t: j.t,
            cpuPct: j.cpuPct,
            heapUsedMb: j.memory.heapUsedMb,
            heapTotalMb: j.memory.heapTotalMb,
            rssMb: j.memory.rssMb,
          };
          const arr = [...prev, next];
          return arr.length > MAX_POINTS ? arr.slice(arr.length - MAX_POINTS) : arr;
        });
        // Per-minute series for concurrent users + req/min — append at most
        // once per minute so the graph spans ~1h, not 2 minutes.
        if (j.t - lastMinuteRef.current >= MINUTE_MS) {
          lastMinuteRef.current = j.t;
          setMinuteTicks((prev) => {
            const next: MinuteTick = {
              t: j.t,
              concurrentUsers: j.concurrentUsers,
              requestsPerMin: j.requestsPerMin,
            };
            const arr = [...prev, next];
            return arr.length > MAX_MINUTE_POINTS
              ? arr.slice(arr.length - MAX_MINUTE_POINTS)
              : arr;
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paused]);

  const latest = ticks[ticks.length - 1];

  return (
    <div className="space-y-4">
      {/* User presence */}
      <Card className="border-border/70">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Who&rsquo;s online</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Users active in the last 60s · refreshes every {POLL_MS / 1000}s
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="rounded-full bg-success/15 text-success px-2 py-0.5 font-semibold">
              {latestFull?.concurrentUsers ?? 0} online
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {latestFull?.activeUsers5m ?? 0} active 5m
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {latestFull && latestFull.onlineUsers.length > 0 ? (
            latestFull.onlineUsers.map((u) => (
              <div
                key={u.userId}
                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/20 pl-1 pr-2.5 py-0.5"
                title={`@${u.userId}`}
              >
                <UserAvatar src={u.avatar} name={u.username} size={20} online />
                <span className="text-[11px] font-medium">{u.username}</span>
              </div>
            ))
          ) : (
            <div className="text-[11px] text-muted-foreground">Nobody&rsquo;s here right now.</div>
          )}
        </div>
      </Card>

      {/* DB counts */}
      <Card className="border-border/70">
        <h3 className="text-sm font-semibold">Database</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Approximate document counts (estimatedDocumentCount).
        </p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <Metric label="Users" value={latestFull?.counts.users.toLocaleString() ?? "—"} />
          <Metric label="Matches" value={latestFull?.counts.matches.toLocaleString() ?? "—"} />
          <Metric label="Predictions" value={latestFull?.counts.predictions.toLocaleString() ?? "—"} />
          <Metric label="Rivalries" value={latestFull?.counts.rivalries.toLocaleString() ?? "—"} />
        </div>
      </Card>

      {/* Process performance */}
      <Card className="border-border/70">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Live performance</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sampled every {POLL_MS / 1000}s · last {MAX_POINTS} points (~
              {Math.round((MAX_POINTS * POLL_MS) / 1000 / 60)} min)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted/40"
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>

        {error && <div className="mt-2 text-[11px] text-danger">{error}</div>}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
          <Metric label="CPU" value={latest ? `${latest.cpuPct.toFixed(1)}%` : "—"} color="text-primary" />
          <Metric label="Heap" value={latest ? `${latest.heapUsedMb} MB` : "—"} color="text-success" />
          <Metric label="RSS" value={latest ? `${latest.rssMb} MB` : "—"} color="text-warning" />
          <Metric
            label="Concurrent"
            value={latestFull ? String(latestFull.concurrentUsers) : "—"}
            color="text-accent"
          />
          <Metric
            label="Req/min"
            value={latestFull ? String(latestFull.requestsPerMin) : "—"}
            color="text-foreground"
            hint="per lambda"
          />
        </div>

        <div className="mt-3 space-y-3">
          <Sparkline
            label="CPU %"
            color="rgb(var(--primary))"
            points={ticks.map((t) => t.cpuPct)}
            max={Math.min(100, Math.max(10, ...ticks.map((t) => t.cpuPct * 1.2)))}
            unit="%"
          />
          <Sparkline
            label="Heap MB"
            color="rgb(var(--success))"
            points={ticks.map((t) => t.heapUsedMb)}
            max={Math.max(1, ...ticks.map((t) => t.heapTotalMb))}
            unit="MB"
          />
          <Sparkline
            label="RSS MB"
            color="rgb(var(--warning))"
            points={ticks.map((t) => t.rssMb)}
            max={Math.max(1, ...ticks.map((t) => t.rssMb)) * 1.2}
            unit="MB"
          />
          <Sparkline
            label={`Concurrent users (1 sample / min · last ${MAX_MINUTE_POINTS} min)`}
            color="rgb(var(--accent))"
            points={minuteTicks.map((t) => t.concurrentUsers)}
            max={Math.max(1, ...minuteTicks.map((t) => t.concurrentUsers)) * 1.2}
            unit=""
          />
          <Sparkline
            label={`Requests / minute · per lambda (1 sample / min · last ${MAX_MINUTE_POINTS} min)`}
            color="rgb(var(--foreground))"
            points={minuteTicks.map((t) => t.requestsPerMin)}
            max={Math.max(5, ...minuteTicks.map((t) => t.requestsPerMin)) * 1.2}
            unit=""
          />
        </div>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">
        {label}
      </div>
      <div className={`text-sm font-semibold tabular-nums ${color ?? ""}`}>
        {value}
      </div>
      {hint && <div className="text-[9px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function Sparkline({
  label,
  color,
  points,
  max,
  unit,
}: {
  label: string;
  color: string;
  points: number[];
  max: number;
  unit: string;
}) {
  const W = 600;
  const H = 60;
  const PAD = 4;
  const n = points.length;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const path =
    n > 1
      ? points
          .map((v, i) => {
            const x = PAD + (i / (n - 1)) * innerW;
            const y = PAD + (1 - Math.min(1, v / max)) * innerH;
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : "";
  const fillPath =
    n > 1
      ? `${path} L${(PAD + innerW).toFixed(1)},${(PAD + innerH).toFixed(
          1,
        )} L${PAD.toFixed(1)},${(PAD + innerH).toFixed(1)} Z`
      : "";

  const last = points[n - 1];
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
        <span>{label}</span>
        <span className="tabular-nums">
          {typeof last === "number" ? `${last}${unit === "%" ? "%" : ` ${unit}`}` : "—"} ·
          max {Math.round(max)}
          {unit === "%" ? "%" : ""}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full h-12 rounded bg-muted/20"
      >
        {fillPath && <path d={fillPath} fill={color} opacity={0.18} />}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  );
}
