"use client";

import { useState } from "react";

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// Stable colored gradient from a string (no hashing dep).
function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue1 = Math.abs(h) % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 70% 55%) 0%, hsl(${hue2} 70% 40%) 100%)`;
}

/** Read-only circular avatar with initial fallback. */
export function UserAvatar({
  src,
  name,
  size = 32,
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = getInitials(name);
  const style = src
    ? {}
    : { background: gradientFor(name), width: size, height: size };
  return (
    <span
      className={
        "inline-flex items-center justify-center rounded-full overflow-hidden text-white font-semibold select-none shrink-0 " +
        className
      }
      style={{ width: size, height: size, ...style }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span style={{ fontSize: Math.max(10, Math.floor(size * 0.4)) }}>
          {initials}
        </span>
      )}
    </span>
  );
}

/** Clickable avatar that opens a modal showing the full image. */
export function ClickableUserAvatar({
  src,
  name,
  size = 36,
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          "inline-flex items-center justify-center align-middle p-0 border-0 bg-transparent leading-none rounded-full overflow-hidden ring-1 ring-border hover:ring-primary/50 transition focus:outline-none focus:ring-2 focus:ring-ring " +
          className
        }
        aria-label={`Show ${name}'s avatar`}
      >
        <UserAvatar src={src} name={name} size={size} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl overflow-hidden ring-1 ring-white/15 bg-card flex items-center justify-center">
              {src ? (
                // Render at the image's NATURAL resolution. We never upscale —
                // that's what was causing the previous blur. The image keeps
                // its own width/height (capped to viewport), so a 512px source
                // shows at 512px on a desktop, not stretched to 800px.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={name}
                  className="block w-auto h-auto object-contain"
                  style={{
                    maxWidth: "min(90vw, 512px)",
                    maxHeight: "min(80vh, 512px)",
                    imageRendering: "auto",
                  }}
                  decoding="async"
                />
              ) : (
                <UserAvatar
                  src={null}
                  name={name}
                  size={320}
                  className="!rounded-2xl"
                />
              )}
            </div>
            <div className="text-white text-sm font-medium">{name}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-card border border-border text-foreground flex items-center justify-center shadow-md hover:bg-muted"
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
