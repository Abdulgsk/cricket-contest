"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, RotateCw, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Premium lightbox: pinch / wheel zoom, drag to pan, ←/→ between images,
 * Esc to close, click outside to close. Renders into a portal so it can sit
 * on top of any layout.
 */

export function Lightbox({
  images,
  index,
  onClose,
  onIndexChange,
  alt,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange?: (next: number) => void;
  alt?: string;
}) {
  const [scale, setScale] = React.useState(1);
  const [rot, setRot] = React.useState(0);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const dragRef = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = React.useCallback(() => {
    setScale(1);
    setRot(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  React.useEffect(() => {
    reset();
  }, [index, reset]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && onIndexChange && index < images.length - 1) {
        onIndexChange(index + 1);
      }
      if (e.key === "ArrowLeft" && onIndexChange && index > 0) {
        onIndexChange(index - 1);
      }
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(8, s * 1.2));
      if (e.key === "-" || e.key === "_") setScale((s) => Math.max(0.2, s / 1.2));
      if (e.key === "0") reset();
      if (e.key === "r" || e.key === "R") setRot((r) => r + 90);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onIndexChange, reset]);

  if (typeof document === "undefined") return null;

  const src = images[index];
  if (!src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white/90">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md bg-white/10 px-2 py-0.5 font-medium">
            {index + 1} / {images.length}
          </span>
          {alt ? <span className="text-white/60">{alt}</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <LbButton title="Zoom out (-)" onClick={() => setScale((s) => Math.max(0.2, s / 1.2))}>
            <ZoomOut className="h-4 w-4" />
          </LbButton>
          <LbButton title="Zoom in (+)" onClick={() => setScale((s) => Math.min(8, s * 1.2))}>
            <ZoomIn className="h-4 w-4" />
          </LbButton>
          <LbButton title="Rotate (R)" onClick={() => setRot((r) => r + 90)}>
            <RotateCw className="h-4 w-4" />
          </LbButton>
          <a
            href={src}
            download={`screenshot-${index + 1}.png`}
            className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <LbButton title="Close (Esc)" onClick={onClose}>
            <X className="h-4 w-4" />
          </LbButton>
        </div>
      </div>

      {/* viewport */}
      <div
        className="relative flex flex-1 select-none items-center justify-center overflow-hidden"
        onWheel={(e) => {
          e.preventDefault();
          setScale((s) =>
            Math.max(0.2, Math.min(8, s * (e.deltaY < 0 ? 1.1 : 1 / 1.1))),
          );
        }}
        onMouseDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          setOffset({
            x: dragRef.current.ox + (e.clientX - dragRef.current.x),
            y: dragRef.current.oy + (e.clientY - dragRef.current.y),
          });
        }}
        onMouseUp={() => (dragRef.current = null)}
        onMouseLeave={() => (dragRef.current = null)}
      >
        {onIndexChange && index > 0 ? (
          <button
            onClick={() => onIndexChange(index - 1)}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/80 backdrop-blur hover:bg-white/20"
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        {onIndexChange && index < images.length - 1 ? (
          <button
            onClick={() => onIndexChange(index + 1)}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/80 backdrop-blur hover:bg-white/20"
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? "screenshot"}
          draggable={false}
          className="max-h-full max-w-full cursor-grab object-contain transition-[transform] duration-100 ease-out active:cursor-grabbing"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rot}deg)`,
          }}
          onDoubleClick={() => (scale === 1 ? setScale(2.5) : reset())}
        />
      </div>

      {/* hint */}
      <div className="px-4 pb-3 pt-2 text-center text-[11px] text-white/50">
        Scroll to zoom · Drag to pan · Double-click to toggle · R rotate · 0 reset · Esc close
      </div>
    </div>,
    document.body,
  );
}

function LbButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

/** Convenience: a thumbnail strip that opens the lightbox on click. */
export function ScreenshotStrip({
  images,
  alt,
  className,
}: {
  images: string[];
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState<number | null>(null);
  if (!images?.length) return null;
  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative overflow-hidden rounded-xl border border-border/60 bg-muted/40 transition hover:border-primary/40 hover:shadow-sm"
            aria-label={`Open screenshot ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${alt ?? "screenshot"} ${i + 1}`}
              className="h-20 w-28 object-cover transition group-hover:scale-[1.03]"
              loading="lazy"
            />
            <span className="pointer-events-none absolute inset-0 flex items-end justify-end p-1.5">
              <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                Open
              </span>
            </span>
          </button>
        ))}
      </div>
      {open !== null ? (
        <Lightbox
          images={images}
          index={open}
          onClose={() => setOpen(null)}
          onIndexChange={setOpen}
          alt={alt}
        />
      ) : null}
    </>
  );
}
