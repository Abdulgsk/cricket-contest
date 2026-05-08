"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, Badge } from "@/components/ui/card";
import { createCustomPoolAction, deleteCustomPoolAction } from "@/actions/custom-pools";

interface Pool {
  id: string;
  question: string;
  options: string[];
  pointsValue: number;
  scored: boolean;
  correctOption?: string;
}

export function CustomPoolEditor({ matchId, initial }: { matchId: string; initial: Pool[] }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [pts, setPts] = useState(5);

  const setOpt = (i: number, v: string) => setOpts((arr) => arr.map((x, j) => (j === i ? v : x)));
  const addOpt = () => setOpts((arr) => (arr.length < 13 ? [...arr, ""] : arr));
  const removeOpt = (i: number) => setOpts((arr) => arr.filter((_, j) => j !== i));

  return (
    <Card>
      <h2 className="font-semibold mb-3">🎯 Custom Prediction Pools</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Add extra prediction questions for this match (e.g. &ldquo;Will there be a super over?&rdquo;,
        &ldquo;Who will be impact player?&rdquo;). Hidden from users until the match starts.
      </p>

      {initial.length > 0 && (
        <div className="space-y-2 mb-4">
          {initial.map((p) => (
            <div key={p.id} className="rounded-xl bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{p.question}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p.options.length} options · {p.pointsValue} pts
                    {p.scored && p.correctOption && (
                      <> · ✅ correct: <span className="text-success">{p.correctOption}</span></>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.scored && <Badge tone="success">scored</Badge>}
                  {!p.scored && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await deleteCustomPoolAction(p.id);
                          toast.success("Pool removed");
                        })
                      }
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {p.options.map((o) => (
                  <span key={o} className="text-xs rounded-full bg-background/60 px-2 py-0.5">
                    {o}
                  </span>
                ))}
              </div>
            </div>
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
        <div className="space-y-1.5">
          <Label>Points (correct pick)</Label>
          <Input type="number" min={1} max={50} value={pts} onChange={(e) => setPts(Number(e.target.value))} />
        </div>
        <Button
          variant="glow"
          disabled={pending || !q.trim() || opts.filter((o) => o.trim()).length < 2}
          onClick={() =>
            start(async () => {
              const r = await createCustomPoolAction({
                matchId,
                question: q.trim(),
                options: opts.map((o) => o.trim()).filter(Boolean),
                pointsValue: pts,
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
