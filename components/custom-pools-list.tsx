"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { submitCustomPoolPredictionAction } from "@/actions/custom-pools";

export interface CustomPoolView {
  id: string;
  question: string;
  options: string[];
  pointsValue: number;
  revealed: boolean;
  scored: boolean;
  /** ISO timestamp when picks close. */
  closesAt: string;
  /** Server-computed lock state (pool deadline or match lock). */
  locked: boolean;
  correctOption?: string;
  myChoice?: string;
  totalCount: number;
  split: { choice: string; count: number; pct: number }[];
  allChoices?: { username: string; choice: string; correct?: boolean }[];
}

export function CustomPoolsList({
  pools,
  canPredict,
}: {
  pools: CustomPoolView[];
  canPredict: boolean;
}) {
  if (!pools.length) return null;
  return (
    <Card>
      <h2 className="font-semibold mb-3">🎯 Custom Prediction Pools</h2>
      <div className="space-y-4">
        {pools.map((p) => (
          <PoolCard key={p.id} pool={p} canPredict={canPredict} />
        ))}
      </div>
    </Card>
  );
}

/** Live countdown to the pool deadline. Re-ticks every second. */
function Countdown({ closesAt }: { closesAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = new Date(closesAt).getTime();
  const ms = target - now;
  if (ms <= 0) {
    return <span className="text-danger">closed</span>;
  }
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  let label: string;
  if (d > 0) label = `${d}d ${h}h`;
  else if (h > 0) label = `${h}h ${m}m`;
  else if (m > 0) label = `${m}m ${String(s).padStart(2, "0")}s`;
  else label = `${s}s`;
  const urgent = ms <= 15 * 60_000;
  return (
    <span className={urgent ? "text-warning font-medium tabular-nums" : "tabular-nums"}>
      closes in {label}
    </span>
  );
}

function PoolCard({ pool, canPredict }: { pool: CustomPoolView; canPredict: boolean }) {
  const [pending, start] = useTransition();
  const submit = (choice: string) => {
    if (pool.locked || pool.scored) return;
    if (choice === pool.myChoice) return;
    const fd = new FormData();
    fd.set("poolId", pool.id);
    fd.set("choice", choice);
    start(async () => {
      const r = await submitCustomPoolPredictionAction(fd);
      if (!r.ok) {
        toast.error(r.error);
      } else if (r.updated) {
        toast.success(`Updated to ${choice} 🔁`);
      } else {
        toast.success(`Locked in: ${choice} 🔒`);
      }
    });
  };

  const canEdit = canPredict && !pool.locked && !pool.scored;

  return (
    <div className="rounded-xl bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{pool.question}</div>
          <div
            className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5"
            suppressHydrationWarning
          >
            <span>+{pool.pointsValue} pts if correct</span>
            <span>· {pool.totalCount} answered</span>
            {!pool.scored ? (
              <span className="inline-flex items-center gap-1">·{" "}
                <Countdown closesAt={pool.closesAt} />
              </span>
            ) : null}
          </div>
        </div>
        {pool.scored ? (
          <Badge tone="success">scored</Badge>
        ) : pool.locked ? (
          <Badge tone="warning">locked</Badge>
        ) : pool.revealed ? (
          <Badge tone="warning">revealed</Badge>
        ) : (
          <Badge tone="accent">🔒 hidden</Badge>
        )}
      </div>

      {/* Pick buttons — always available until the pool is locked, so you can
          update your pick before the deadline. */}
      {canEdit && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {pool.options.map((o) => {
            const mine = pool.myChoice === o;
            return (
              <Button
                key={o}
                variant={mine ? "glow" : "outline"}
                size="sm"
                disabled={pending}
                onClick={() => submit(o)}
                className="justify-start"
              >
                {mine ? "✓ " : ""}
                {o}
              </Button>
            );
          })}
        </div>
      )}

      {/* Once locked but not yet scored, show the locked pick */}
      {!canEdit && pool.myChoice && !pool.scored && (
        <div className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
          🔒 Locked in: <strong>{pool.myChoice}</strong>
        </div>
      )}

      {canPredict && pool.locked && !pool.myChoice && !pool.scored && (
        <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Deadline passed — no pick recorded.
        </div>
      )}

      {/* Per-user result once scored */}
      {pool.scored && pool.myChoice && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            pool.myChoice === pool.correctOption
              ? "bg-success/10 text-success"
              : "bg-danger/10 text-danger"
          }`}
        >
          {pool.myChoice === pool.correctOption ? (
            <>✓ You picked {pool.myChoice} · +{pool.pointsValue} pts added to your total</>
          ) : (
            <>✗ You picked {pool.myChoice} · correct answer was {pool.correctOption ?? "—"}</>
          )}
        </div>
      )}
      {pool.scored && !pool.myChoice && (
        <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          You did not lock in a pick · correct answer was {pool.correctOption ?? "—"}
        </div>
      )}

      {/* Aggregate split — always visible */}
      <div className="mt-3 space-y-1.5">
        {pool.split.map((s) => (
          <div key={s.choice} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className={pool.correctOption === s.choice ? "text-success font-semibold" : ""}>
                {s.choice}
                {pool.correctOption === s.choice && " ✓"}
              </span>
              <span className="text-muted-foreground">{s.pct}% ({s.count})</span>
            </div>
            <div className="h-1.5 rounded-full bg-background/60 overflow-hidden">
              <div
                className={`h-full ${pool.correctOption === s.choice ? "bg-success" : "bg-gradient-to-r from-pink-500 to-sky-400"}`}
                style={{ width: `${s.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {pool.revealed && pool.allChoices && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {pool.allChoices.map((a, i) => (
            <div
              key={i}
              className={`rounded-lg px-2 py-1 text-xs ${
                a.correct === true
                  ? "bg-success/10 text-success"
                  : a.correct === false
                    ? "bg-danger/10 text-muted-foreground"
                    : "bg-background/60"
              }`}
            >
              <span className="font-medium">{a.username}</span>
              <span className="text-muted-foreground"> · {a.choice}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
