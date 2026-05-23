"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertOctagon, XCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitWorkItemResolutionAction } from "@/actions/work-items";

type Kind = "done" | "blocked" | "wont_do";

const OPTIONS: {
  kind: Kind;
  label: string;
  hint: string;
  icon: typeof CheckCircle2;
  tone: string;
  ring: string;
}[] = [
  {
    kind: "done",
    label: "Done",
    hint: "I finished the work. Manager will verify and close.",
    icon: CheckCircle2,
    tone: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/40 bg-emerald-500/10",
  },
  {
    kind: "blocked",
    label: "Blocked",
    hint: "I'm stuck. Need help or more info to continue.",
    icon: AlertOctagon,
    tone: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-500/40 bg-amber-500/10",
  },
  {
    kind: "wont_do",
    label: "Won't do",
    hint: "Not feasible or out of scope. Manager will decide.",
    icon: XCircle,
    tone: "text-rose-700 dark:text-rose-300",
    ring: "ring-rose-500/40 bg-rose-500/10",
  },
];

const PLACEHOLDERS: Record<Kind, string> = {
  done: "What did you do? Commit hash, steps taken, things to verify…",
  blocked: "What's blocking you? What info or access do you need?",
  wont_do: "Why isn't this worth doing? Link any earlier discussion that backs you up.",
};

export function MyWorkItemResolveForm({ id }: { id: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
        <Lock className="h-4 w-4 shrink-0" />
        <span>Submitted. A manager will review — refresh to see status.</span>
      </div>
    );
  }

  const submit = () => {
    if (!kind) return;
    if (note.trim().length < 3) {
      toast.error("Add a short note (3+ chars).");
      return;
    }
    start(async () => {
      const res = await submitWorkItemResolutionAction({
        id,
        kind,
        note: note.trim(),
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to submit");
        return;
      }
      toast.success("Submitted — manager will review");
      setDone(true);
    });
  };

  return (
    <div className="border-t border-border/40 pt-3 space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Submit your outcome
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = kind === opt.kind;
          return (
            <button
              key={opt.kind}
              type="button"
              onClick={() => setKind(opt.kind)}
              disabled={pending}
              className={`text-left rounded-xl border px-3 py-2.5 transition ${
                active
                  ? `ring-2 ${opt.ring} border-transparent`
                  : "border-border/70 hover:bg-muted/30"
              }`}
            >
              <div className={`flex items-center gap-2 ${opt.tone}`}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">{opt.label}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                {opt.hint}
              </div>
            </button>
          );
        })}
      </div>
      {kind && (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder={PLACEHOLDERS[kind]}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
