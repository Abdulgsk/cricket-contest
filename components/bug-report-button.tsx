"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { submitBugReportAction } from "@/actions/bugs";

type Severity = "low" | "medium" | "high";

export function BugReportButton({
  variant = "nav",
}: {
  variant?: "nav" | "floating";
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [pending, start] = useTransition();
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setSeverity("medium");
  };

  const submit = () => {
    if (title.trim().length < 3) {
      toast.error("Give your bug a short title (3+ chars).");
      return;
    }
    if (description.trim().length < 5) {
      toast.error("Add a few words describing the problem.");
      return;
    }
    start(async () => {
      const res = await submitBugReportAction({
        title: title.trim(),
        description: description.trim(),
        severity,
        pageUrl: pathname || "",
      });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't submit bug.");
        return;
      }
      toast.success("Thanks — bug report sent to admins.");
      reset();
      setOpen(false);
    });
  };

  const trigger =
    variant === "floating" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        className="fixed bottom-4 right-4 z-40 rounded-full bg-card border border-border shadow-lg px-3.5 py-2 text-xs font-medium hover:bg-muted/50 transition flex items-center gap-1.5"
      >
        <BugIcon className="size-3.5" />
        Report a bug
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
      >
        <BugIcon className="size-4" />
        Report a bug
      </button>
    );

  const dialog = open && (
    <div
      className="fixed inset-0 z-[2147483646] flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => !pending && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report a bug"
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card text-card-foreground shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <BugIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Report a bug</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tell the admins what went wrong — they&apos;ll see it on the admin dashboard.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bonus history shows wrong total"
              className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
              maxLength={140}
              disabled={pending}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              What happened?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Steps to reproduce, what you expected, what you saw…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y"
              maxLength={4000}
              disabled={pending}
            />
            <div className="text-[10px] text-muted-foreground text-right mt-0.5">
              {description.length} / 4000
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Severity
            </label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["low", "medium", "high"] as Severity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  disabled={pending}
                  className={
                    "h-9 rounded-lg border text-xs font-medium capitalize transition " +
                    (severity === s
                      ? s === "high"
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : s === "medium"
                          ? "border-warning/50 bg-warning/10 text-warning"
                          : "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="flex-1 h-10 rounded-xl border border-border bg-card text-sm font-medium hover:bg-muted/40 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-sm transition"
          >
            {pending ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {trigger}
      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}

function BugIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M19 7l-3 2" />
      <path d="M5 7l3 2" />
      <path d="M19 13h-3" />
      <path d="M8 13H5" />
      <path d="M19 19l-3-2" />
      <path d="M5 19l3-2" />
      <path d="M9 4l1.5 2" />
      <path d="M15 4l-1.5 2" />
    </svg>
  );
}
