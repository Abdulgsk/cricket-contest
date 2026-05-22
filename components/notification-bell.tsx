"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  listMyNotificationsAction,
  markAllNotificationsReadAction,
  markOneNotificationReadAction,
} from "@/actions/notifications";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const kindMeta: Record<string, { dot: string; glow: string; icon: ReactNode }> = {
  match_reminder: {
    dot: "bg-warning",
    glow: "bg-warning/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  result_published: {
    dot: "bg-success",
    glow: "bg-success/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <path d="M6 9l4 4 8-8" />
        <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8" />
      </svg>
    ),
  },
  rivalry: {
    dot: "bg-danger",
    glow: "bg-danger/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <path d="M14 4l6 6-9 9-6-6 9-9z" />
      </svg>
    ),
  },
  bug: {
    dot: "bg-accent",
    glow: "bg-accent/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <rect x="8" y="6" width="8" height="14" rx="4" />
        <path d="M19 13h-3M8 13H5" />
      </svg>
    ),
  },
  system: {
    dot: "bg-primary",
    glow: "bg-primary/15",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    ),
  },
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, start] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unread = items.filter((i) => !i.read).length;
  const hasItems = items.length > 0;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (document.hidden) return;
      try {
        const next = await listMyNotificationsAction(30);
        if (!cancelled) setItems(next);
      } catch {
        /* ignore */
      }
    };
    run();
    const id = setInterval(run, 60_000);
    const onVis = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await listMyNotificationsAction(30);
      setItems(next);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!open) refresh();
    setOpen((v) => !v);
  };

  const markAll = () => {
    start(async () => {
      await markAllNotificationsReadAction();
      setItems((rs) => rs.map((r) => ({ ...r, read: true })));
    });
  };

  const onItemClick = (item: Item) => {
    if (!item.read) {
      setItems((rs) => rs.map((r) => (r.id === item.id ? { ...r, read: true } : r)));
      start(async () => {
        try {
          await markOneNotificationReadAction(item.id);
        } catch {
          /* ignore */
        }
      });
    }
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        className={cn(
          "group relative inline-flex items-center justify-center size-11 rounded-full",
          "border border-border/70 bg-card/80 backdrop-blur",
          "shadow-sm hover:shadow-md hover:border-primary/40 hover:bg-card transition-all duration-200",
        )}
      >
        <BellIcon
          className={cn(
            "size-5 transition-transform duration-200",
            unread > 0 ? "text-primary group-hover:rotate-[14deg]" : "text-foreground/70",
          )}
        />
        {unread > 0 && (
          <>
            <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] px-1 rounded-full bg-gradient-to-br from-danger to-danger/80 text-white text-[10px] font-bold flex items-center justify-center shadow-lg ring-2 ring-card">
              {unread > 9 ? "9+" : unread}
            </span>
            <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping opacity-60 pointer-events-none" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2.5 w-[22rem] sm:w-[26rem] rounded-2xl border border-border/70 bg-card/95 backdrop-blur-xl text-card-foreground shadow-2xl shadow-foreground/10 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 zoom-in-95 duration-200 origin-top-right">
          <div className="relative px-4 py-3 border-b border-border/50 bg-gradient-to-br from-primary/8 via-card to-card overflow-hidden">
            <div className="absolute -top-8 -right-8 size-24 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
            <div className="relative flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <BellIcon className="size-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-sm leading-tight">Notifications</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {unread > 0 ? `${unread} unread` : "All caught up"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={markAll}
                disabled={unread === 0}
                className={cn(
                  "text-[11px] font-medium rounded-md px-2 py-1 transition",
                  unread > 0
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground/60 cursor-default",
                )}
              >
                Mark all read
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && !hasItems ? (
              <SkeletonList />
            ) : !hasItems ? (
              <EmptyState />
            ) : (
              <ul className="divide-y divide-border/30">
                {items.map((n) => {
                  const meta = kindMeta[n.kind] ?? kindMeta.system;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onItemClick(n)}
                        className={cn(
                          "w-full text-left px-4 py-3 group transition-colors duration-150",
                          "hover:bg-gradient-to-r hover:from-primary/[0.04] hover:to-transparent",
                          !n.read && "bg-primary/[0.03]",
                        )}
                      >
                        <div className="flex gap-3">
                          <div className="relative shrink-0">
                            <div className={cn("size-8 rounded-xl flex items-center justify-center", meta.glow, !n.read ? "text-foreground" : "text-muted-foreground")}>
                              {meta.icon}
                            </div>
                            {!n.read && (
                              <span className={cn("absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card", meta.dot)} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <div className={cn("text-sm leading-tight truncate", n.read ? "text-foreground/80 font-medium" : "text-foreground font-semibold")}>
                                {n.title}
                              </div>
                              <div className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                {timeAgo(n.createdAt)}
                              </div>
                            </div>
                            <div className={cn("text-xs mt-1 line-clamp-2 leading-snug", n.read ? "text-muted-foreground" : "text-foreground/90")}>
                              {n.body}
                            </div>
                            {n.link && (
                              <div className="mt-1.5 text-[10px] text-primary/80 group-hover:text-primary flex items-center gap-1">
                                Open
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-2.5 transition-transform group-hover:translate-x-0.5">
                                  <path d="M5 12h14M13 5l7 7-7 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-2 border-t border-border/50 bg-muted/20 flex justify-between items-center text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-success animate-pulse" />
              Live · refreshes every 60s
            </span>
            <button
              type="button"
              onClick={refresh}
              className="hover:text-foreground transition flex items-center gap-1"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("size-3", loading && "animate-spin")}>
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 3v6h6" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-10 px-6 text-center">
      <div className="mx-auto size-14 rounded-2xl bg-primary/[0.08] flex items-center justify-center mb-3">
        <BellIcon className="size-6 text-primary/60" />
      </div>
      <div className="text-sm font-semibold text-foreground">All quiet</div>
      <p className="text-xs text-muted-foreground mt-1">
        You&apos;ll see match reminders, results, and rivalry alerts here.
      </p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="divide-y divide-border/30">
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-4 py-3 flex gap-3">
          <div className="size-8 rounded-xl bg-muted/60 animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded bg-muted/60 animate-pulse" />
            <div className="h-2.5 w-full rounded bg-muted/40 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-muted/40 animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function BellIcon({ className }: { className?: string }) {
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
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
