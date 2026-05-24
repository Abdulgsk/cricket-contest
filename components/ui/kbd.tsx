"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Inline keyboard chip. */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-border bg-background px-1.5 font-mono text-[10.5px] font-semibold text-foreground shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.08)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Cross-platform shortcut renderer: ⌘ on mac, Ctrl elsewhere. */
export function Shortcut({ keys }: { keys: string[] }) {
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.platform));
    }
  }, []);
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => {
        let label = k;
        if (k === "Mod") label = isMac ? "⌘" : "Ctrl";
        if (k === "Shift") label = "⇧";
        if (k === "Alt") label = isMac ? "⌥" : "Alt";
        if (k === "Enter") label = "↵";
        if (k === "Esc") label = "Esc";
        return <Kbd key={i}>{label}</Kbd>;
      })}
    </span>
  );
}
