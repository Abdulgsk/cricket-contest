"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { submitBugReportAction } from "@/actions/bugs";

type Severity = "low" | "medium" | "high";

const MAX_SHOTS = 3;

/** Pages the reporter can pick from in the dropdown. Free-form "other" reveals
 * a text field so they can paste an exact URL or describe the screen. */
const PAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "/dashboard", label: "Home / Dashboard" },
  { value: "/leaderboard", label: "Leaderboard" },
  { value: "/analytics", label: "Analytics" },
  { value: "/matches", label: "Matches" },
  { value: "/predictions", label: "Predictions" },
  { value: "/rivalry", label: "Challenges (Rivalry / Civil War)" },
  { value: "/contests", label: "Contests" },
  { value: "/players", label: "Players / Profile" },
  { value: "/rules", label: "Rules" },
  { value: "/profile", label: "My profile" },
  { value: "/notifications", label: "Notifications" },
  { value: "/my-bugs", label: "My bug reports" },
  { value: "/my-work-items", label: "My work items" },
  { value: "/admin", label: "Admin area" },
  { value: "/developer", label: "Developer tools" },
];

/** Downscale + JPEG-compress an image File to a data URL under ~600KB. */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Image load failed"));
    im.src = dataUrl;
  });
  const MAX_DIM = 1600;
  let { width, height } = img;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  // Try progressively lower quality until under threshold.
  for (const q of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length <= 700_000) return out;
  }
  return canvas.toDataURL("image/jpeg", 0.35);
}

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
  const [shots, setShots] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, start] = useTransition();
  /** Selected page from the dropdown. Empty string = "not specified", literal
   * "__other__" reveals a free-form input the user fills with a URL/description. */
  const [pageChoice, setPageChoice] = useState<string>("");
  const [pageCustom, setPageCustom] = useState("");

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
    setShots([]);
    setPageChoice("");
    setPageCustom("");
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_SHOTS - shots.length;
    if (room <= 0) {
      toast.error(`Maximum ${MAX_SHOTS} screenshots.`);
      return;
    }
    const list = Array.from(files).slice(0, room).filter((f) => /^image\//.test(f.type));
    if (list.length === 0) return;
    setCompressing(true);
    try {
      const out: string[] = [];
      for (const f of list) {
        try {
          out.push(await compressImage(f));
        } catch {
          toast.error(`Couldn't read ${f.name}`);
        }
      }
      if (out.length) setShots((prev) => [...prev, ...out]);
    } finally {
      setCompressing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
    const resolvedPageUrl =
      pageChoice === "__other__"
        ? pageCustom.trim()
        : pageChoice.trim();
    start(async () => {
      const res = await submitBugReportAction({
        title: title.trim(),
        description: description.trim(),
        severity,
        pageUrl: resolvedPageUrl,
        screenshots: shots,
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
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Which page? <span className="normal-case text-muted-foreground/70">(optional)</span>
            </label>
            <select
              value={pageChoice}
              onChange={(e) => setPageChoice(e.target.value)}
              disabled={pending}
              className="mt-1 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">— Select a page —</option>
              {PAGE_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value="__other__">Other (paste URL or describe)</option>
            </select>
            {pageChoice === "__other__" && (
              <input
                type="text"
                value={pageCustom}
                onChange={(e) => setPageCustom(e.target.value)}
                placeholder="Paste URL or describe where (e.g. /matches/abc123 or 'leaderboard filter')"
                maxLength={500}
                disabled={pending}
                className="mt-2 w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
              />
            )}
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Screenshots <span className="normal-case text-muted-foreground/70">(optional, up to {MAX_SHOTS})</span>
              </label>
              <span className="text-[10px] text-muted-foreground">{shots.length}/{MAX_SHOTS}</span>
            </div>
            {shots.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {shots.map((src, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Screenshot ${i + 1}`}
                      className="h-16 w-16 object-cover rounded-md border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setShots((prev) => prev.filter((_, j) => j !== i))}
                      disabled={pending}
                      aria-label="Remove screenshot"
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-foreground text-background text-[11px] leading-5 text-center shadow opacity-90 hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending || compressing || shots.length >= MAX_SHOTS}
              className="mt-2 h-9 w-full rounded-lg border border-dashed border-border bg-background/50 text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-50 transition"
            >
              {compressing ? "Compressing…" : shots.length >= MAX_SHOTS ? "Limit reached" : "+ Add screenshot"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
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
