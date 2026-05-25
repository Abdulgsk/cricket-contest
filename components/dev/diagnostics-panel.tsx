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
    storage?: {
      dataMb: number;
      indexMb: number;
      storageMb: number;
      totalMb: number;
      objects: number;
      collections: number;
      avgObjSizeKb: number;
      top: Array<{
        name: string;
        count: number;
        dataMb: number;
        indexMb: number;
        totalMb: number;
      }>;
    } | null;
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
        {data.mongo.storage ? <MongoStorage storage={data.mongo.storage} /> : null}
      </Card>

      <LiveDiagnosticsChart />
    </div>
  );
}

function MongoStorage({
  storage,
}: {
  storage: NonNullable<DiagnosticsData["mongo"]["storage"]>;
}) {
  const max = Math.max(1, ...storage.top.map((t) => t.totalMb));
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MiniStat label="Total" value={fmtMb(storage.totalMb)} accent />
        <MiniStat label="Data" value={fmtMb(storage.dataMb)} />
        <MiniStat label="Indexes" value={fmtMb(storage.indexMb)} />
        <MiniStat
          label="Documents"
          value={storage.objects.toLocaleString()}
          hint={`${storage.collections} colls`}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Top collections by size</span>
          <span className="normal-case font-normal text-muted-foreground/70">
            avg doc {storage.avgObjSizeKb} KB
          </span>
        </div>
        <ul className="space-y-1.5">
          {storage.top.map((t) => {
            const pct = (t.totalMb / max) * 100;
            return (
              <li key={t.name}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="truncate font-mono text-foreground/85">{t.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {fmtMb(t.totalMb)}{" "}
                    <span className="text-muted-foreground/60">
                      · {t.count.toLocaleString()} docs
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="flex h-full"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  >
                    <div
                      className="h-full bg-primary/80"
                      style={{
                        width: `${(t.dataMb / Math.max(0.0001, t.totalMb)) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-accent/70"
                      style={{
                        width: `${(t.indexMb / Math.max(0.0001, t.totalMb)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center gap-3 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-primary/80" /> data
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-accent/70" /> indexes
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border px-2.5 py-2 " +
        (accent ? "border-primary/40 bg-primary/[0.06]" : "border-border/60 bg-card/40")
      }
    >
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-foreground">
        {value}
      </div>
      {hint ? (
        <div className="text-[10px] text-muted-foreground/80">{hint}</div>
      ) : null}
    </div>
  );
}

function fmtMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  if (mb >= 0.001) return `${(mb * 1024).toFixed(1)} KB`;
  return `${(mb * 1024 * 1024).toFixed(0)} B`;
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
