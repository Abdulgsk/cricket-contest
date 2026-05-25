"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Bug, Wrench, Activity, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

export type QueueKind = "bugs" | "workitems" | "diagnostics" | "audit";

export type QueueOption = {
  kind: QueueKind;
  label: string;
  badge?: number;
  content: React.ReactNode;
};

const KIND_ICON: Record<QueueKind, typeof Bug> = {
  bugs: Bug,
  workitems: Wrench,
  diagnostics: Activity,
  audit: ScrollText,
};

/**
 * Single tab that lets the admin switch between Bug reports and Work items
 * via a dropdown. The selected pane mounts; the others stay unmounted to
 * avoid double-fetching activity feeds.
 */
export function QueueSwitcher({ options }: { options: QueueOption[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const urlTab = sp.get("tab") as QueueKind | null;
  const initial: QueueKind =
    (urlTab && options.some((o) => o.kind === urlTab) ? urlTab : options[0]?.kind) ?? "bugs";
  const [active, setActive] = React.useState<QueueKind>(initial);
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // Keep state in sync if user clicks a sub-tab in the nav while on /developer.
  React.useEffect(() => {
    if (urlTab && options.some((o) => o.kind === urlTab) && urlTab !== active) {
      setActive(urlTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab]);

  const selectKind = (kind: QueueKind) => {
    setActive(kind);
    setOpen(false);
    const params = new URLSearchParams(sp.toString());
    params.set("tab", kind);
    router.replace(`/developer?${params.toString()}`, { scroll: false });
  };

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = options.find((o) => o.kind === active) ?? options[0];
  const Icon = current ? KIND_ICON[current.kind] : Bug;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2" ref={wrapRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-1.5 text-sm font-semibold hover:bg-muted/40"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <Icon className="h-4 w-4 text-primary" />
            {current?.label}
            {typeof current?.badge === "number" && current.badge > 0 ? (
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[10.5px] font-bold text-primary-foreground">
                {current.badge}
              </span>
            ) : null}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition", open && "rotate-180")}
            />
          </button>
          {open ? (
            <ul
              role="listbox"
              className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-popover text-[13px] shadow-2xl"
            >
              {options.map((opt) => {
                const OptIcon = KIND_ICON[opt.kind];
                const selected = opt.kind === active;
                return (
                  <li key={opt.kind}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => selectKind(opt.kind)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted",
                        selected && "bg-primary/10 text-primary",
                      )}
                    >
                      <OptIcon className="h-3.5 w-3.5" />
                      <span className="flex-1">{opt.label}</span>
                      {typeof opt.badge === "number" && opt.badge > 0 ? (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                          {opt.badge}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <span className="text-[11px] text-muted-foreground">
          Switch between developer tools.
        </span>
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
