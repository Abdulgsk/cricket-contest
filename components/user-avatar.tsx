"use client";

import { useState } from "react";
import Link from "next/link";
import { useIsOnline } from "@/components/presence-provider";

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

/** Read-only circular avatar with initial fallback.
 *
 * When `profileId` is supplied, the avatar becomes a `<Link>` to
 * `/players/{profileId}` so clicking it navigates to that user's profile.
 * Presence dot lights up automatically via `useIsOnline` when the user is
 * active in the last 60s.
 */
export function UserAvatar({
  src,
  name,
  userId,
  profileId,
  size = 32,
  className = "",
  online,
}: {
  src?: string | null;
  name: string;
  /** my11 / userId handle — when supplied, presence is auto-detected. */
  userId?: string | null;
  /** Mongo user id — when supplied, the avatar links to /players/{profileId}. */
  profileId?: string | null;
  size?: number;
  className?: string;
  /** Force the presence dot on/off. When omitted, looks up live presence. */
  online?: boolean;
}) {
  const livePresence = useIsOnline(userId, name);
  const showOnline = online ?? livePresence;
  const initials = getInitials(name);
  const style = src
    ? {}
    : { background: gradientFor(name), width: size, height: size };
  // Dot scales with avatar size, clamped for readability.
  const dot = Math.max(8, Math.round(size * 0.28));
  const inner = (
    <>
      <span
        className="inline-flex items-center justify-center rounded-full overflow-hidden text-white font-semibold select-none"
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
      {showOnline && (
        <span
          aria-label="Online"
          title="Online now"
          className="absolute bottom-0 right-0 rounded-full bg-success ring-2 ring-card"
          style={{ width: dot, height: dot }}
        />
      )}
    </>
  );
  if (profileId) {
    return (
      <Link
        href={`/players/${profileId}`}
        title={`View ${name}'s profile`}
        className={
          "relative inline-flex items-center justify-center shrink-0 rounded-full ring-1 ring-border hover:ring-primary/60 transition focus:outline-none focus:ring-2 focus:ring-ring " +
          className
        }
        style={{ width: size, height: size }}
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span
      className={
        "relative inline-flex items-center justify-center shrink-0 rounded-full " +
        className
      }
      style={{ width: size, height: size }}
    >
      {inner}
    </span>
  );
}

/** Clickable avatar that opens a modal showing the full image. */
export function ClickableUserAvatar({
  src,
  name,
  userId,
  profileId,
  size = 36,
  className = "",
  online,
}: {
  src?: string | null;
  name: string;
  userId?: string | null;
  /** Mongo user id — when supplied, the avatar links to the profile page
   *  instead of opening the image-zoom modal. */
  profileId?: string | null;
  size?: number;
  className?: string;
  online?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // When we know whose profile this is, prefer navigation over the modal.
  if (profileId) {
    return (
      <UserAvatar
        src={src}
        name={name}
        userId={userId}
        profileId={profileId}
        size={size}
        online={online}
        className={className}
      />
    );
  }

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
          "inline-flex items-center justify-center align-middle p-0 border-0 bg-transparent leading-none rounded-full overflow-visible focus:outline-none focus:ring-2 focus:ring-ring " +
          className
        }
        aria-label={`Show ${name}'s avatar`}
      >
        <UserAvatar src={src} name={name} userId={userId} size={size} online={online} className="ring-1 ring-border hover:ring-primary/50 transition rounded-full" />
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
