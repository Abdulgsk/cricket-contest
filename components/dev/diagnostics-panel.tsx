import { Card } from "@/components/ui/card";
import { LiveDiagnosticsChart } from "@/components/dev/live-diagnostics-chart";

export type DiagnosticsData = {
  uptimeSec: number;
  nodeVersion: string;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
  };
  mongo: {
    state: "connected" | "connecting" | "disconnected" | "uninitialized";
    host: string | null;
  };
  generatedAt: string;
};

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export function DiagnosticsPanel({ data }: { data: DiagnosticsData }) {
  const memPct = Math.round(
    (data.memory.heapUsedMb / Math.max(1, data.memory.heapTotalMb)) * 100,
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Runtime diagnostics</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live numbers from the current server lambda. On serverless these
              reset between cold starts.
            </p>
          </div>
          <div className="text-[10px] text-muted-foreground" suppressHydrationWarning>
            {new Date(data.generatedAt).toLocaleTimeString()}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Uptime" value={formatUptime(data.uptimeSec)} />
        <Stat label="Node" value={data.nodeVersion} />
        <Stat
          label="Heap used"
          value={`${data.memory.heapUsedMb} MB`}
          hint={`of ${data.memory.heapTotalMb} MB (${memPct}%)`}
        />
        <Stat
          label="RSS"
          value={`${data.memory.rssMb} MB`}
          hint={`external ${data.memory.externalMb} MB`}
        />
      </div>

      <Card className="border-border/70">
        <h3 className="text-sm font-semibold">Memory</h3>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, memPct)}%` }}
          />
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Heap {data.memory.heapUsedMb} MB / {data.memory.heapTotalMb} MB · RSS{" "}
          {data.memory.rssMb} MB · External {data.memory.externalMb} MB
        </div>
      </Card>

      <Card className="border-border/70">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mongo</h3>
          <span
            className={
              "text-[10px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 " +
              (data.mongo.state === "connected"
                ? "bg-success/15 text-success"
                : "bg-danger/15 text-danger")
            }
          >
            {data.mongo.state}
          </span>
        </div>
        {data.mongo.host && (
          <div className="mt-1 text-[11px] text-muted-foreground break-all">
            {data.mongo.host}
          </div>
        )}
      </Card>

      <LiveDiagnosticsChart />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3 sm:p-4 border-border/70">
      <div className="text-[10px] sm:text-xs uppercase text-muted-foreground tracking-wider">
        {label}
      </div>
      <div className="text-xl sm:text-2xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </Card>
  );
}
