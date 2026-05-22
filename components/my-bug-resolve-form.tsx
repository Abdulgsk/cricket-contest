"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertOctagon, XCircle, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitBugResolutionAction } from "@/actions/bugs";

type Kind = "fixed" | "blocked" | "wont_fix";

const OPTIONS: {
  kind: Kind;
  label: string;
  hint: string;
  icon: typeof CheckCircle2;
  tone: string;
  ring: string;
}[] = [
  {
    kind: "fixed",
    label: "Fixed",
    hint: "I shipped a fix. Admin will verify and close.",
    icon: CheckCircle2,
    tone: "text-emerald-300",
    ring: "ring-emerald-500/40 bg-emerald-500/10",
  },
  {
    kind: "blocked",
    label: "Blocked",
    hint: "I hit something I can't get past. Need help / more info.",
    icon: AlertOctagon,
    tone: "text-amber-300",
    ring: "ring-amber-500/40 bg-amber-500/10",
  },
  {
    kind: "wont_fix",
    label: "Won't fix",
    hint: "Not a bug, or out of scope. Admin will decide.",
    icon: XCircle,
    tone: "text-rose-300",
    ring: "ring-rose-500/40 bg-rose-500/10",
  },
];

const PLACEHOLDERS: Record<Kind, string> = {
  fixed: "What did you do? Commit hash, steps taken, things to verify…",
  blocked: "What are you stuck on? What info or access do you need to continue?",
  wont_fix: "Why isn't this a bug? Link any earlier discussion or rule that backs you up.",
};

export function MyBugResolveForm({ id }: { id: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-300">
        <Lock className="h-4 w-4 shrink-0" />
        <span>
          Submitted. The admin will review and close — refresh to see status.
        </span>
      </div>
    );
  }

  const canSubmit = kind !== null && note.trim().length >= 3 && !pending;

  const submit = () => {
    if (!kind) return;
    if (note.trim().length < 3) {
      toast.error("Add a short note (3+ chars).");
      return;
    }
    start(async () => {
      const res = await submitBugResolutionAction({
        id,
        kind,
        note: note.trim(),
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to submit");
        return;
      }
      toast.success("Submitted — admin will review");
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
        <div className="space-y-2">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Your note
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={PLACEHOLDERS[kind]}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
            maxLength={4000}
            disabled={pending}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              You can&apos;t edit this after submitting. The admin will accept
              or reopen.
            </p>
            <Button size="sm" onClick={submit} disabled={!canSubmit}>
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
