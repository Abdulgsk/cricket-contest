"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type MessageMenuItem = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  danger?: boolean;
};

/**
 * WhatsApp-style message menu. Triggered by:
 *  - right-click anywhere on the row (children opaque hit area)
 *  - long-press on touch devices (500ms)
 *  - the optional "more" button rendered via the renderTrigger callback
 *
 * The menu renders in a portal at the cursor position and closes on outside
 * click, Escape, or scroll. Pass `items` already filtered for permissions.
 */
export function MessageMenu({
  items,
  children,
  className,
  renderTrigger,
  as: Tag = "div",
}: {
  items: MessageMenuItem[];
  children?: React.ReactNode;
  className?: string;
  renderTrigger?: (open: (e: React.MouseEvent | React.TouchEvent) => void) => React.ReactNode;
  as?: "div" | "li" | "span";
}) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const openAt = React.useCallback((x: number, y: number) => {
    // Clamp into viewport so the menu never overflows.
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 768;
    const W = 180;
    const H = items.length * 36 + 8;
    setPos({
      x: Math.min(Math.max(8, x), vw - W - 8),
      y: Math.min(Math.max(8, y), vh - H - 8),
    });
  }, [items.length]);

  const close = React.useCallback(() => setPos(null), []);

  React.useEffect(() => {
    if (!pos) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return close();
      if (!wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos, close]);

  const onContextMenu = (e: React.MouseEvent) => {
    if (items.length === 0) return;
    e.preventDefault();
    openAt(e.clientX, e.clientY);
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (items.length === 0) return;
    const t = e.touches[0];
    if (!t) return;
    const { clientX, clientY } = t;
    longPressTimer.current = setTimeout(() => openAt(clientX, clientY), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const openFromTrigger = (e: React.MouseEvent | React.TouchEvent) => {
    if (items.length === 0) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    openAt(rect.right, rect.bottom);
  };

  return (
    <>
      <Tag
        className={className}
        onContextMenu={onContextMenu}
        onTouchStart={onTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onTouchMove={cancelLongPress}
      >
        {children}
        {renderTrigger?.(openFromTrigger)}
      </Tag>
      {pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={wrapRef}
              role="menu"
              style={{ position: "fixed", left: pos.x, top: pos.y, width: 180 }}
              className="z-[120] overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md"
            >
              {items.map((it, i) => {
                const Icon = it.icon;
                return (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      it.onSelect();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px]",
                      it.danger
                        ? "text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                    <span>{it.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
