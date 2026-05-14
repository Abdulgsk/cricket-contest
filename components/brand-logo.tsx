import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE = {
  sm: { mark: 22, gap: "gap-2", text: "text-base" },
  md: { mark: 28, gap: "gap-2.5", text: "text-lg" },
  lg: { mark: 36, gap: "gap-3", text: "text-2xl" },
} as const;

/**
 * GullyXI brand mark — a minimal, professional logo:
 *   - A rounded badge containing three stumps with bails (the wicket silhouette)
 *     and a cricket ball arcing in.
 *   - A bold wordmark where "Gully" sits in the foreground and "XI" reads as a
 *     two-stop primary→accent gradient, evoking a crest.
 *
 * Uses theme tokens via `currentColor` and `var(--accent)`, so it adapts to
 * every theme (sand, paper, mist, google, ink) without per-theme overrides.
 */
export function BrandLogo({
  size = "md",
  showWordmark = true,
  className,
  href,
}: {
  size?: Size;
  showWordmark?: boolean;
  className?: string;
  href?: string;
}) {
  const s = SIZE[size];
  const content = (
    <span
      className={cn(
        "inline-flex items-center font-semibold tracking-tight",
        s.gap,
        s.text,
        className,
      )}
    >
      <BrandMark size={s.mark} />
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
            XI
          </span>
        </span>
      )}
    </span>
  );

  if (href) {
    // Caller can wrap with <Link>; this just returns the visual.
    return content;
  }
  return content;
}

function BrandMark({ size = 28 }: { size?: number }) {
  // 32x32 viewBox. A monogram "G" formed by an arc + a horizontal bar that
  // doubles as a cricket bat. A small ball sits in the negative space, with
  // a single seam stroke for cricket recognition.
  // All strokes use currentColor (theme primary); ball fill uses --accent.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="GullyXI"
      className="shrink-0"
      style={{ color: "rgb(var(--primary))" }}
    >
      {/* Soft tonal disc behind the mark for depth */}
      <defs>
        <linearGradient id="gxi-disc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" fill="url(#gxi-disc)" />
      <circle
        cx="16"
        cy="16"
        r="14.5"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
      />

      {/* The "G" — a 270° arc opening to the right, finished by a horizontal
          inner bar (the bat handle line) that gives the letter its anchor. */}
      <path
        d="M22.5 10
           A 7 7 0 1 0 22.5 22
           L 17 22
           L 17 16.25
           L 22.5 16.25"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Cricket ball nested in the G's mouth — accent color with a seam */}
      <g>
        <circle
          cx="22.6"
          cy="19.4"
          r="2.1"
          fill="rgb(var(--accent))"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="0.6"
        />
        <path
          d="M21 19.1c1-.25 2.2-.25 3.2 0"
          stroke="rgb(var(--background))"
          strokeOpacity="0.85"
          strokeWidth="0.45"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
