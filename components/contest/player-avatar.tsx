"use client";

import { useState } from "react";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<Size, number> = {
  xs: 24,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
};

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue1 = Math.abs(h) % 360;
  const hue2 = (hue1 + 35) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 65% 52%) 0%, hsl(${hue2} 70% 38%) 100%)`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return ((first + (parts.length > 1 ? last : "")) || "?").toUpperCase();
}

/**
 * Premium-feel circular player avatar.
 * - Uses My11Circle CDN imgURL when available, falls back to gradient + initials
 * - Optional captain / VC ring color
 * - Optional small badge tile in the corner (e.g. team short)
 */
export function PlayerAvatar({
  src,
  name,
  size = "md",
  ring = "default",
  className = "",
  teamShort,
}: {
  src?: string | null;
  name: string;
  size?: Size;
  ring?: "default" | "captain" | "vice" | "muted" | "none";
  className?: string;
  teamShort?: string | null;
}) {
  const px = SIZE_PX[size];
  const [errored, setErrored] = useState(false);
  const showImg = src && !errored;

  const ringClass =
    ring === "captain"
      ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-background"
      : ring === "vice"
      ? "ring-2 ring-sky-400 ring-offset-1 ring-offset-background"
      : ring === "muted"
      ? "ring-1 ring-border/60"
      : ring === "none"
      ? ""
      : "ring-2 ring-background shadow-sm";

  return (
    <span className={"relative inline-flex shrink-0 " + className} style={{ width: px, height: px }}>
      <span
        className={
          "block h-full w-full overflow-hidden rounded-full text-white font-semibold select-none " +
          ringClass
        }
        style={
          showImg
            ? { background: "transparent" }
            : { background: gradientFor(name) }
        }
      >
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src!}
            alt={name}
            width={px}
            height={px}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setErrored(true)}
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center"
            style={{ fontSize: Math.max(9, Math.floor(px * 0.38)) }}
          >
            {initials(name)}
          </span>
        )}
      </span>
      {teamShort && (
        <span
          className="absolute -bottom-1 -right-1 rounded-md bg-foreground/90 px-1 text-[8px] font-bold leading-[14px] text-background shadow-sm"
          aria-hidden
        >
          {teamShort.slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}
