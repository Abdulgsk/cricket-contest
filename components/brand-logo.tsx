"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE = {
  sm: { mark: 28, text: "text-sm sm:text-base", gap: "gap-2" },
  md: { mark: 36, text: "text-base sm:text-lg", gap: "gap-2.5" },
  lg: { mark: 48, text: "text-lg sm:text-2xl", gap: "gap-3" },
  xl: { mark: 72, text: "text-xl sm:text-3xl", gap: "gap-3.5" },
} as const;

const LOGO_SRC = "/gully11-logo.png";

/**
 * Gully11 brand mark — image-based logo from /public/gully11-logo.png.
 *
 *   - Renders the PNG brand mark.
 *   - When `clickable` is true, the mark opens a centered preview modal
 *     (same UX as the profile-picture preview).
 *   - Sizes scale responsively. The PNG is square so it fits any size.
 *
 * The wordmark is OFF by default because the image already contains the
 * "GULLY 11" lockup. Pass showWordmark to add a text label next to it.
 */
export function BrandLogo({
  size = "md",
  showWordmark = true,
  clickable = false,
  className,
  alt = "Gully11",
}: {
  size?: Size;
  showWordmark?: boolean;
  clickable?: boolean;
  className?: string;
  alt?: string;
}) {
  const s = SIZE[size];
  const [open, setOpen] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const mark = imgOk ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt={alt}
      width={s.mark}
      height={s.mark}
      className="block rounded-xl shrink-0 select-none"
      style={{ width: s.mark, height: s.mark }}
      draggable={false}
      onError={() => setImgOk(false)}
    />
  ) : (
    // Fallback when /gully11-logo.png isn't present — themed monogram tile.
    <span
      className="inline-flex items-center justify-center rounded-xl shrink-0 font-bold text-white"
      style={{
        width: s.mark,
        height: s.mark,
        fontSize: Math.floor(s.mark * 0.42),
        background:
          "linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--accent)) 100%)",
      }}
      aria-hidden
    >
      G11
    </span>
  );

  const inner = (
    <span
      className={cn(
        "inline-flex items-center font-semibold tracking-tight",
        s.gap,
        s.text,
        className,
      )}
    >
      {mark}
      {showWordmark && (
        <span className="leading-none">
          <span className="text-foreground">Gully</span>
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--accent)) 100%)",
            }}
          >
            11
          </span>
        </span>
      )}
    </span>
  );

  if (!clickable) return inner;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center bg-transparent border-0 p-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
        aria-label={`View ${alt} logo`}
      >
        {inner}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Brand logo preview"
        >
          <div
            className="relative max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl overflow-hidden ring-1 ring-white/15 bg-card max-w-[92vw] max-h-[80vh] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOGO_SRC}
                alt={alt}
                className="block max-w-[92vw] max-h-[80vh] w-auto h-auto object-contain"
                decoding="async"
              />
            </div>
            <div className="text-white text-sm font-medium">{alt}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 h-9 w-9 rounded-full bg-card border border-border text-foreground flex items-center justify-center shadow-md hover:bg-muted"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
