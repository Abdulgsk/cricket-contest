import { Card } from "@/components/ui/card";
import type { PointsBreakdown, PointsBucket } from "@/services/points-breakdown";

function fmt(n: number) {
  return n > 0 ? `+${n}` : `${n}`;
}

function BucketRow({ b, negative }: { b: PointsBucket; negative?: boolean }) {
  const tone = negative ? "text-danger" : b.points > 0 ? "text-success" : "text-muted-foreground";
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{b.label}</div>
        {b.hint && (
          <div className="text-[11px] text-muted-foreground truncate">{b.hint}</div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={`text-sm font-semibold tabular-nums ${tone}`}>{fmt(b.points)}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">×{b.count}</div>
      </div>
    </div>
  );
}

export function PointsBreakdownCard({
  breakdown,
  title = "Points by source",
  subtitle = "Every discrete way you have gained or lost points this season.",
  compact = false,
}: {
  breakdown: PointsBreakdown;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const groups = breakdown.groups.filter((g) => g.buckets.length > 0);
  const { totals, meta } = breakdown;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total</div>
          <div className="text-2xl font-semibold tabular-nums">{totals.grand}</div>
          <div className="text-[11px] text-muted-foreground">
            {meta.matchesPlayed} played
            {meta.matchesMissed > 0 ? ` · ${meta.matchesMissed} missed` : ""}
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scored matches yet.</p>
      ) : (
        <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {groups.map((g) => {
            const negative = g.key === "penalty";
            const tone = negative
              ? "text-danger"
              : g.total > 0
                ? "text-success"
                : "text-muted-foreground";
            return (
              <div
                key={g.key}
                className="rounded-2xl border border-border/60 bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </span>
                  <span className={`text-sm font-semibold tabular-nums ${tone}`}>
                    {fmt(g.total)}
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {g.buckets.map((b) => (
                    <BucketRow key={b.key} b={b} negative={negative} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
