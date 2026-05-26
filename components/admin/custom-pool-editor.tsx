"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, Badge } from "@/components/ui/card";
import {
  createCustomPoolAction,
  deleteCustomPoolAction,
  extendCustomPoolDeadlineAction,
} from "@/actions/custom-pools";

interface Pool {
  id: string;
  question: string;
  options: string[];
  pointsValue: number;
  scored: boolean;
  correctOption?: string;
  closesAt?: string;
}

/** Format a date as "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CustomPoolEditor({
  matchId,
  initial,
  matchStart,
}: {
  matchId: string;
  initial: Pool[];
  /** ISO match start time — used as default + max for the deadline picker. */
  matchStart?: string | null;
}) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [pts, setPts] = useState(5);
  const matchStartDate = matchStart ? new Date(matchStart) : null;
  const [closesAt, setClosesAt] = useState<string>(
    matchStartDate ? toLocalInput(matchStartDate) : "",
  );

  const setOpt = (i: number, v: string) => setOpts((arr) => arr.map((x, j) => (j === i ? v : x)));
  const addOpt = () => setOpts((arr) => (arr.length < 13 ? [...arr, ""] : arr));
  const removeOpt = (i: number) => setOpts((arr) => arr.filter((_, j) => j !== i));

  return (
    <Card>
      <h2 className="font-semibold mb-3">🎯 Custom Prediction Pools</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Add extra prediction questions for this match. Pools are strictly
        per-match — picks close at the deadline you set (capped at match
        start) and never carry to another match.
      </p>

      {initial.length > 0 && (
        <div className="space-y-2 mb-4">
          {initial.map((p) => (
            <PoolRow
              key={p.id}
              pool={p}
              matchStart={matchStartDate}
            />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Question</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Will RCB win the toss?" />
        </div>
        <div>
          <Label>Options (2–13)</Label>
          <div className="space-y-2 mt-1.5">
            {opts.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                {opts.length > 2 && (
                  <Button size="sm" variant="outline" onClick={() => removeOpt(i)}>×</Button>
                )}
              </div>
            ))}
            {opts.length < 13 && (
              <Button size="sm" variant="outline" onClick={addOpt}>+ Add option</Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Points (correct pick)</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={pts}
              onChange={(e) => setPts(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Closes at {matchStartDate ? "(≤ match start)" : ""}</Label>
            <Input
              type="datetime-local"
              value={closesAt}
              max={matchStartDate ? toLocalInput(matchStartDate) : undefined}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </div>
        </div>
        <Button
          variant="glow"
          loading={pending}
          disabled={pending || !q.trim() || opts.filter((o) => o.trim()).length < 2}
          onClick={() =>
            start(async () => {
              const r = await createCustomPoolAction({
                matchId,
                question: q.trim(),
                options: opts.map((o) => o.trim()).filter(Boolean),
                pointsValue: pts,
                closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
              });
              if (r.ok) {
                toast.success("Pool created");
                setQ("");
                setOpts(["", ""]);
                setPts(5);
              } else toast.error(r.error);
            })
          }
        >
          {pending ? "Saving…" : "Add custom pool"}
        </Button>
      </div>
    </Card>
  );
}

function PoolRow({
  pool,
  matchStart,
}: {
  pool: Pool;
  matchStart: Date | null;
}) {
  const [pending, start] = useTransition();
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [closesAt, setClosesAt] = useState<string>(
    pool.closesAt ? toLocalInput(new Date(pool.closesAt)) : "",
  );

  const saveDeadline = () => {
    if (!closesAt) {
      toast.error("Pick a new deadline");
      return;
    }
    const next = new Date(closesAt);
    if (Number.isNaN(next.getTime())) {
      toast.error("Invalid deadline");
      return;
    }
    if (next.getTime() <= Date.now()) {
      toast.error("Deadline must be in the future");
      return;
    }
    start(async () => {
      const r = await extendCustomPoolDeadlineAction({
        poolId: pool.id,
        closesAt: next.toISOString(),
      });
      if (r.ok) {
        toast.success("Deadline updated");
        setEditingDeadline(false);
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="rounded-xl bg-muted/30 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-medium text-sm">{pool.question}</div>
          <div className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
            {pool.options.length} options · {pool.pointsValue} pts
            {pool.closesAt && (
              <> · closes {new Date(pool.closesAt).toLocaleString()}</>
            )}
            {pool.scored && pool.correctOption && (
              <> · ✅ correct: <span className="text-success">{pool.correctOption}</span></>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {pool.scored && <Badge tone="success">scored</Badge>}
          {!pool.scored && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setEditingDeadline((v) => !v)}
              >
                {editingDeadline ? "Cancel" : "Extend"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={pending}
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Delete this pool and all its picks?")) return;
                  start(async () => {
                    const r = await deleteCustomPoolAction(pool.id);
                    if (r && "ok" in r && !r.ok) toast.error(r.error);
                    else toast.success("Pool removed");
                  });
                }}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {editingDeadline && !pool.scored && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">
              New deadline {matchStart ? "(≤ match start)" : ""}
            </Label>
            <Input
              type="datetime-local"
              value={closesAt}
              max={matchStart ? toLocalInput(matchStart) : undefined}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="glow"
            loading={pending}
            disabled={pending}
            onClick={saveDeadline}
          >
            Save
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-1 mt-2">
        {pool.options.map((o) => (
          <span key={o} className="text-xs rounded-full bg-background/60 px-2 py-0.5">
            {o}
          </span>
        ))}
      </div>
    </div>
  );
}
