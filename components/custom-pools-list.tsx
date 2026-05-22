"use client";
import { useTransition } from "react";
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

function PoolCard({ pool, canPredict }: { pool: CustomPoolView; canPredict: boolean }) {
  const [pending, start] = useTransition();
  const submit = (choice: string) => {
    const fd = new FormData();
    fd.set("poolId", pool.id);
    fd.set("choice", choice);
    start(async () => {
      const r = await submitCustomPoolPredictionAction(fd);
      if (r.ok) toast.success("Locked in 🔒");
      else toast.error(r.error);
    });
  };

  return (
    <div className="rounded-xl bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{pool.question}</div>
          <div className="text-xs text-muted-foreground">
            +{pool.pointsValue} pts if correct · {pool.totalCount} answered
          </div>
        </div>
        {pool.scored ? (
          <Badge tone="success">scored</Badge>
        ) : pool.revealed ? (
          <Badge tone="warning">revealed</Badge>
        ) : (
          <Badge tone="accent">🔒 hidden</Badge>
        )}
      </div>

      {/* Pre-lock window: locked-in = show locked badge; otherwise option buttons */}
      {canPredict && pool.myChoice && (
        <div className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
          🔒 Locked in: <strong>{pool.myChoice}</strong>
        </div>
      )}
      {canPredict && !pool.myChoice && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {pool.options.map((o) => (
            <Button
              key={o}
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => submit(o)}
              className="justify-start"
            >
              {o}
            </Button>
          ))}
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
