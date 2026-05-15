"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  requestMy11NameChangeAction,
  cancelMy11NameRequestAction,
  verifyMy11NameAction,
  saveMy11NameAction,
} from "@/actions/my11-name";

export type My11NameRequest = {
  requested: string;
  requestedAt: string;
  status: "pending" | "approved" | "denied";
  decidedAt?: string | null;
  deniedReason?: string | null;
} | null;

type Props = {
  currentName: string;
  request: My11NameRequest;
  graceUntil: string | null;
  onClose: () => void;
};

type VerifySample = {
  teamA: string;
  teamB: string;
  score: number;
  rank: number | null;
};

function fmtRemaining(ms: number) {
  if (ms <= 0) return "0m";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function My11NameChangeDialog({
  currentName,
  request,
  graceUntil,
  onClose,
}: Props) {
  const inGrace =
    !!graceUntil && new Date(graceUntil).getTime() > Date.now();
  const isApproved = request?.status === "approved";
  const isPending = request?.status === "pending";
  const isDenied = request?.status === "denied";

  const initialName = isApproved
    ? request!.requested
    : isPending
    ? request!.requested
    : "";

  const [step, setStep] = useState<"choose" | "verify" | "saved">(
    inGrace || isApproved ? "verify" : "choose"
  );
  const [name, setName] = useState(initialName);
  const [verifyState, setVerifyState] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "matched"; sample: VerifySample }
    | { state: "miss" }
    | { state: "error"; msg: string }
  >({ state: "idle" });
  const [pending, start] = useTransition();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ESC to close + lock background scroll while open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [pending, onClose]);

  // Live countdown for grace window
  const graceMs = graceUntil
    ? new Date(graceUntil).getTime() - now
    : 0;

  const submitRequest = () =>
    start(async () => {
      const r = await requestMy11NameChangeAction(name);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.status === "approved") {
        toast.success("Verification window open");
        setStep("verify");
      } else {
        toast.success("Request sent to admins");
        onClose();
      }
    });

  const cancelRequest = () =>
    start(async () => {
      const r = await cancelMy11NameRequestAction();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Request cancelled");
      onClose();
    });

  const runCheck = () =>
    start(async () => {
      setVerifyState({ state: "checking" });
      const r = await verifyMy11NameAction(name);
      if (!r.ok) {
        setVerifyState({ state: "error", msg: r.error });
        return;
      }
      if (r.matched && r.sample) {
        setVerifyState({ state: "matched", sample: r.sample });
      } else {
        setVerifyState({ state: "miss" });
      }
    });

  const runSave = () =>
    start(async () => {
      const r = await saveMy11NameAction(name);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("My11Circle name saved");
      setStep("saved");
      // Soft refresh after a beat so SSR data picks up the new state.
      setTimeout(onClose, 800);
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="my11-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-popover/95 backdrop-blur-2xl shadow-[0_25px_70px_-15px_rgba(0,0,0,0.7)] ring-1 ring-white/5 flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="relative flex items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent px-4 sm:px-5 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-base shrink-0">
              🎯
            </div>
            <div className="min-w-0">
              <h3 id="my11-dialog-title" className="text-sm font-semibold leading-tight">
                Change My11Circle name
              </h3>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                {step === "choose"
                  ? "Request → verify → save"
                  : step === "verify"
                  ? "Verify against live leaderboard"
                  : "All set"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          {/* Current value */}
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/10 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Current My11Circle name
            </div>
            <div className="text-sm font-mono mt-0.5 break-all">
              {currentName || <span className="text-muted-foreground italic">not set</span>}
            </div>
          </div>

          {/* Grace banner */}
          {inGrace && step !== "saved" && (
            <div className="rounded-xl border border-success/30 bg-gradient-to-br from-success/15 to-success/5 px-3 py-2.5 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-base leading-none">✅</span>
                <div>
                  <div className="font-semibold text-success">Free-change window open</div>
                  <div className="text-muted-foreground mt-0.5">
                    Verify &amp; save again for the next <span className="font-mono text-foreground">{fmtRemaining(graceMs)}</span> without admin approval.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending banner */}
          {step === "choose" && isPending && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs space-y-2">
              <div>
                <span className="font-semibold text-warning">Awaiting approval:</span>{" "}
                You requested <span className="font-mono">{request!.requested}</span> on{" "}
                {new Date(request!.requestedAt).toLocaleString()}.
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={cancelRequest}
                loading={pending}
              >
                Cancel request
              </Button>
            </div>
          )}

          {/* Denied banner */}
          {step === "choose" && isDenied && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs">
              <div className="font-semibold text-danger">Last request denied</div>
              {request!.deniedReason && (
                <div className="mt-0.5 text-muted-foreground">
                  Reason: {request!.deniedReason}
                </div>
              )}
              <div className="mt-1 text-muted-foreground">
                You can submit a new request below.
              </div>
            </div>
          )}

          {/* STEP: choose / submit request */}
          {step === "choose" && !isPending && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Submit a new My11Circle username for admin approval. Once approved, you&apos;ll be asked to verify it before it&apos;s saved.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="my11-new">New My11Circle name</Label>
                <Input
                  id="my11-new"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="exact username"
                  disabled={pending}
                  autoFocus
                />
              </div>
              <Button
                onClick={submitRequest}
                loading={pending}
                disabled={pending || !name.trim()}
                className="w-full"
                variant="glow"
              >
                Submit for approval
              </Button>
            </div>
          )}

          {/* STEP: verify (approved or in grace) */}
          {step === "verify" && (
            <div className="space-y-3">
              {/* Custom warning alert (replaces browser alert) */}
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none">⚠️</span>
                  <div className="space-y-1">
                    <div className="font-semibold text-amber-400">
                      Make sure this matches exactly
                    </div>
                    <p className="text-muted-foreground">
                      The My11Circle ID you save here must match the My11 name in your Gully11 account.
                      If it doesn&apos;t, your fantasy points will be mapped to <span className="font-semibold text-foreground">0</span> in matches.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="my11-verify">My11Circle name to verify</Label>
                <div className="flex gap-2">
                  <Input
                    id="my11-verify"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setVerifyState({ state: "idle" });
                    }}
                    placeholder="exact username"
                    disabled={pending}
                    autoFocus
                  />
                  <Button
                    onClick={runCheck}
                    loading={pending && verifyState.state === "checking"}
                    disabled={pending || !name.trim()}
                    variant="outline"
                  >
                    Check
                  </Button>
                </div>
              </div>

              {/* Verify result */}
              {verifyState.state === "matched" && (
                <div className="rounded-xl border border-success/40 bg-gradient-to-br from-success/15 to-success/5 px-3 py-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none">✅</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-success">Matched on live leaderboard</div>
                      <div className="mt-0.5 text-muted-foreground break-words">
                        Found <span className="font-mono text-foreground">{name}</span> in {verifyState.sample.teamA} vs {verifyState.sample.teamB}
                        {verifyState.sample.rank ? `, rank #${verifyState.sample.rank}` : ""}, score <span className="font-bold text-foreground">{verifyState.sample.score}</span>.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {verifyState.state === "miss" && (
                <div className="rounded-xl border border-danger/40 bg-gradient-to-br from-danger/15 to-danger/5 px-3 py-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none">❌</span>
                    <div>
                      <div className="font-semibold text-danger">No match found</div>
                      <div className="mt-0.5 text-muted-foreground">
                        This name didn&apos;t appear in any recent contest leaderboard with a fantasy score. Double-check your My11Circle username and try again.
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {verifyState.state === "error" && (
                <div className="rounded-xl border border-danger/40 bg-gradient-to-br from-danger/15 to-danger/5 px-3 py-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none">⚠️</span>
                    <div>
                      <div className="font-semibold text-danger">Verification failed</div>
                      <div className="mt-0.5 text-muted-foreground">{verifyState.msg}</div>
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={runSave}
                loading={pending && verifyState.state !== "checking"}
                disabled={
                  pending ||
                  verifyState.state !== "matched" ||
                  !name.trim()
                }
                className="w-full"
                variant="glow"
              >
                Save name
              </Button>
            </div>
          )}

          {step === "saved" && (
            <div className="rounded-xl border border-success/40 bg-gradient-to-br from-success/15 to-success/5 px-4 py-5 text-center animate-in zoom-in-95 duration-200">
              <div className="text-3xl mb-1">🎉</div>
              <div className="font-semibold text-success text-sm">Saved successfully</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Free-change window now open for 6 hours.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
