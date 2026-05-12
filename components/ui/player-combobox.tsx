"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxPlayer = {
  name: string;
  role?: string;
  keeper?: boolean;
};

function PlayerIcons({ role, keeper }: { role?: string; keeper?: boolean }) {
  if (!role && !keeper) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs shrink-0">
      {keeper && <span title="Wicket-keeper">🧤</span>}
      {role === "BOWL" && <span title="Bowler">⚾</span>}
      {role === "BAT" && <span title="Batsman">🏏</span>}
      {role === "AR" && (
        <>
          <span title="All-rounder (bat)">🏏</span>
          <span title="All-rounder (bowl)">⚾</span>
        </>
      )}
    </span>
  );
}

interface PlayerComboboxProps {
  value: string;
  onChange: (value: string) => void;
  players: string[];
  playerInfo?: ComboboxPlayer[];
  placeholder?: string;
  disabled?: boolean;
  name?: string; // for hidden input (form submission)
  required?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function PlayerCombobox({
  value,
  onChange,
  players,
  playerInfo,
  placeholder = "— pick a player —",
  disabled,
  name,
  required,
  className,
  triggerClassName,
}: PlayerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [rect, setRect] = useState<DOMRect | null>(null);

  const infoMap = useMemo(
    () => new Map((playerInfo ?? []).map((p) => [p.name, p])),
    [playerInfo]
  );

  const sorted = useMemo(
    () => [...players].sort((a, b) => a.localeCompare(b)),
    [players]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => p.toLowerCase().includes(q));
  }, [sorted, query]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  // Position dropdown, close on outside-scroll
  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const measure = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    };
    measure();
    const onScroll = (e: Event) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Scroll highlighted into view
  useEffect(() => {
    const el = itemRefs.current.get(highlight);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const select = useCallback(
    (player: string) => {
      onChange(player);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) select(filtered[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const selectedInfo = infoMap.get(value);

  const dropdown = open && rect ? (
    <div
      ref={dropdownRef}
      className="fixed z-[9999] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl"
      style={{
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 240),
      }}
      onKeyDown={onKeyDown}
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search player..."
          className="h-7 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {/* List */}
      <div className="max-h-64 overflow-auto p-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No players found.
          </div>
        ) : (
          filtered.map((p, i) => {
            const info = infoMap.get(p);
            const selected = value === p;
            const isHighlight = i === highlight;
            return (
              <button
                key={p}
                ref={(el) => {
                  if (el) itemRefs.current.set(i, el);
                  else itemRefs.current.delete(i);
                }}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(p)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left transition",
                  isHighlight && "bg-muted",
                  selected && "bg-primary/15 text-primary",
                  info?.keeper && !selected && "ring-1 ring-warning/30"
                )}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    selected ? "opacity-100" : "opacity-0"
                  )}
                />
                <PlayerIcons role={info?.role} keeper={info?.keeper} />
                <span className="flex-1 truncate">{p}</span>
                {info?.role && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {info.role}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((s) => !s)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 text-sm transition",
          "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          triggerClassName
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-2", !value && "text-muted-foreground")}>
          {value && <PlayerIcons role={selectedInfo?.role} keeper={selectedInfo?.keeper} />}
          <span className="truncate">{value || placeholder}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}
