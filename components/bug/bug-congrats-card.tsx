"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownLite } from "@/components/ui/markdown";
import {
  colorFromString,
  initials,
  relTimeLong,
  type BugStatus,
  type SubmissionKind,
} from "@/lib/bug-format";

/* ------------------------------------------------------------------------ */
/*  Confetti — pure CSS, no deps, runs once on mount                         */
/* ------------------------------------------------------------------------ */

const CONFETTI_COLORS = [
  "rgb(var(--primary))",
  "rgb(var(--accent))",
  "rgb(var(--success))",
  "rgb(var(--warning))",
];

function Confetti({ count = 80 }: { count?: number }) {
  // Deterministic on first render to avoid SSR/CSR mismatch
  const pieces = React.useMemo(() => {
    const out: Array<{
      left: number;
      delay: number;
      duration: number;
      size: number;
      rotate: number;
      drift: number;
      color: string;
      shape: "rect" | "circle";
    }> = [];
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < count; i++) {
      out.push({
        left: rnd() * 100,
        delay: rnd() * 1.5,
        duration: 3.2 + rnd() * 2.4,
        size: 6 + rnd() * 6,
        rotate: rnd() * 360,
        drift: (rnd() - 0.5) * 240,
        color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)],
        shape: rnd() > 0.5 ? "rect" : "circle",
      });
    }
    return out;
  }, [count]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="bug-congrats-piece"
          style={{
            left: `${p.left}%`,
            top: "-12px",
            width: `${p.size}px`,
            height: `${p.size * (p.shape === "rect" ? 0.45 : 1)}px`,
            background: p.color,
            borderRadius: p.shape === "circle" ? "9999px" : "2px",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            // CSS custom props consumed by the keyframes
            ["--drift" as string]: `${p.drift}px`,
            ["--rot" as string]: `${p.rotate}deg`,
          }}
        />
      ))}
      <style jsx>{`
        .bug-congrats-piece {
          position: absolute;
          opacity: 0;
          will-change: transform, opacity;
          animation-name: bug-congrats-fall;
          animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
          animation-fill-mode: forwards;
          animation-iteration-count: 1;
        }
        @keyframes bug-congrats-fall {
          0% {
            opacity: 0;
            transform: translate3d(0, -20px, 0) rotate(0deg);
          }
          10% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rot));
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .bug-congrats-piece {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Card                                                                     */
/* ------------------------------------------------------------------------ */

export type BugCongratsData = {
  id: string;
  title: string;
  status: Extract<BugStatus, "resolved" | "wont_fix">;
  resolvedAt: string | null;
  createdAt: string;
  assignee: { name: string; handle: string } | null;
  submission: {
    kind: SubmissionKind;
    note: string;
    submittedByName: string;
    submittedAt: string;
  } | null;
};

function Avatar({ name }: { name: string }) {
  const c = colorFromString(name);
  return (
    <span
      className="grid h-12 w-12 place-items-center rounded-full text-[14px] font-bold ring-2 ring-background"
      style={{ background: c.bg, color: c.fg }}
    >
      {initials(name)}
    </span>
  );
}

export function BugCongratsCard({
  bug,
  backHref = "/developer",
  backLabel = "Back",
}: {
  bug: BugCongratsData;
  backHref?: string;
  backLabel?: string;
}) {
  const fixed = bug.status === "resolved";
  const fixer = bug.submission?.submittedByName ?? bug.assignee?.name ?? "the team";
  const when = bug.resolvedAt ?? bug.submission?.submittedAt ?? null;

  // "Fixed in 2h", "Closed in 3d" — gives the reporter a sense of velocity.
  const turnaround = React.useMemo(() => {
    if (!when || !bug.createdAt) return null;
    const ms = new Date(when).getTime() - new Date(bug.createdAt).getTime();
    if (ms < 60_000) return "in under a minute";
    const m = Math.floor(ms / 60_000);
    if (m < 60) return `in ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `in ${d}d`;
    const mo = Math.floor(d / 30);
    return `in ${mo}mo`;
  }, [when, bug.createdAt]);

  return (
    <div className="mx-auto max-w-xl px-3 py-4 sm:px-6 sm:py-10">
      <div className="mb-4 text-[12px] text-muted-foreground">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-[28px] border shadow-[0_30px_80px_-30px_rgb(0_0_0/0.35)] backdrop-blur",
          fixed
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.10] via-card/95 to-card"
            : "border-border/60 bg-gradient-to-br from-muted/40 via-card/95 to-card",
        )}
      >
        {/* atmosphere — soft radial glows */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0",
            fixed
              ? "[background:radial-gradient(700px_340px_at_50%_-12%,rgba(16,185,129,0.22),transparent_60%),radial-gradient(520px_280px_at_110%_110%,rgba(var(--primary),0.12),transparent_60%)]"
              : "[background:radial-gradient(560px_280px_at_50%_-10%,rgba(var(--muted-foreground),0.10),transparent_60%)]",
          )}
        />
        {/* fine grain ring */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/[0.04]"
        />

        {fixed ? <Confetti /> : null}

        <div className="relative px-6 pb-9 pt-12 text-center sm:px-10 sm:pt-14">
          {/* halo + icon */}
          <div className="relative mx-auto mb-6 h-20 w-20">
            <div
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-full blur-2xl",
                fixed ? "bg-emerald-500/40" : "bg-muted-foreground/30",
              )}
            />
            <div
              className={cn(
                "relative grid h-20 w-20 place-items-center rounded-full shadow-xl ring-[6px]",
                fixed
                  ? "bg-emerald-500 text-white ring-emerald-500/20"
                  : "bg-muted text-muted-foreground ring-border/40",
              )}
            >
              {fixed ? (
                <CheckCircle2 className="h-11 w-11" strokeWidth={2.25} />
              ) : (
                <X className="h-11 w-11" strokeWidth={2.25} />
              )}
            </div>
          </div>

          {/* eyebrow */}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em]",
              fixed
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {fixed ? (
              <>
                <Sparkles className="h-3 w-3" />
                Fixed
              </>
            ) : (
              "Closed"
            )}
          </div>

          <h1 className="mt-4 text-balance text-[26px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">
            {fixed ? "Your bug was fixed" : "Your report was closed"}
          </h1>

          <p className="mx-auto mt-2.5 max-w-[34ch] text-balance text-[14px] leading-relaxed text-muted-foreground">
            {fixed
              ? "Thanks for taking the time to report this — the team shipped a fix."
              : "The team reviewed this report and decided not to proceed."}
          </p>

          {/* the bug title — the one detail that matters */}
          <div className="mx-auto mt-7 max-w-md rounded-2xl border border-border/60 bg-background/70 px-5 py-4 text-left backdrop-blur">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              Your report
            </div>
            <div className="mt-1 line-clamp-2 text-[15.5px] font-medium leading-snug text-foreground">
              {bug.title}
            </div>
          </div>

          {/* who + when — single elegant row */}
          {bug.assignee?.name || bug.submission?.submittedByName ? (
            <div className="mx-auto mt-5 inline-flex items-center gap-3 rounded-full border border-border/60 bg-background/60 py-1.5 pl-1.5 pr-4 backdrop-blur">
              <Avatar name={fixer} />
              <div className="text-left leading-tight">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {fixed ? "Fixed by" : "Closed by"}
                </div>
                <div className="text-[14px] font-semibold text-foreground">{fixer}</div>
              </div>
            </div>
          ) : null}

          {when ? (
            <div
              className="mt-3 text-[12px] text-muted-foreground"
              suppressHydrationWarning
            >
              {fixed ? "Shipped" : "Closed"} {relTimeLong(when)}
              {turnaround ? ` · ${fixed ? "fixed" : "closed"} ${turnaround}` : ""}
            </div>
          ) : null}

          {/* optional note from the fixer — quote style */}
          {bug.submission?.note ? (
            <div
              className={cn(
                "mx-auto mt-7 max-w-md rounded-2xl border-l-[3px] bg-background/60 px-5 py-3.5 text-left",
                fixed ? "border-emerald-500/60" : "border-muted-foreground/40",
              )}
            >
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Note from {fixer.split(" ")[0]}
              </div>
              <div className="text-[14px] leading-relaxed text-foreground/90">
                <MarkdownLite text={bug.submission.note} />
              </div>
            </div>
          ) : null}

          <div className="mt-9 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-[0.98]"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
