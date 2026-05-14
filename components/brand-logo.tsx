import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE = {
  sm: { mark: 22, gap: "gap-2", text: "text-sm sm:text-base" },
  md: { mark: 28, gap: "gap-2.5", text: "text-base sm:text-lg" },
  lg: { mark: 36, gap: "gap-3", text: "text-lg sm:text-2xl" },
} as const;

/**
 * GullyXI brand mark — a minimal, professional logo:
 *   - A rounded badge containing three stumps with bails (the wicket silhouette)
 *     and a cricket ball arcing in.
 *   - A bold wordmark where "Gully" sits in the foreground and "XI" reads as a
 *     two-stop primary→accent gradient, evoking a crest.
 *
 * Uses theme tokens via `currentColor` and `var(--accent)`, so it adapts to
 * every theme (sand, paper, mist, halo, ink) without per-theme overrides.
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
  // 36x36 viewBox. Concept: "The Six" — a kinetic trajectory mark.
  //   • A circular crest with a primary→accent gradient ring (sport identity).
  //   • Inside: a thick arc rising from bottom-left to top-right (a ball's
  //     flight path after being hit for six). Stroke is solid → dashed at the
  //     tail to imply motion, finishing in the cricket ball itself.
  //   • A short horizontal line (the boundary) anchors the composition.
  // All colors come from CSS variables so it adapts to every theme.
  // The viewBox + scaling SVG make it inherently responsive.
  const id = "gxi-ring";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="GullyXI"
      className="shrink-0"
      style={{ color: "rgb(var(--primary))" }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="rgb(var(--primary))" />
          <stop offset="100%" stopColor="rgb(var(--accent))" />
        </linearGradient>
      </defs>

      {/* Crest disc — soft tonal fill + gradient ring */}
      <circle
        cx="18"
        cy="18"
        r="16.5"
        fill="currentColor"
        fillOpacity="0.06"
      />
      <circle
        cx="18"
        cy="18"
        r="16.5"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.5"
      />

      {/* Boundary line — sits low in the crest */}
      <line
        x1="7"
        y1="26.5"
        x2="29"
        y2="26.5"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Tiny stumps at launch point (subtle, just two short ticks) */}
      <g
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.1"
        strokeLinecap="round"
      >
        <line x1="9.5" y1="22" x2="9.5" y2="26" />
        <line x1="11.8" y1="22" x2="11.8" y2="26" />
      </g>

      {/* Trajectory: dashed tail → solid arc → ball.
          Painted in two passes so dashes only appear at the start. */}
      <path
        d="M 9.5 23 Q 16 4 26 11"
        stroke={`url(#${id})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="1.5 2.2"
        strokeOpacity="0.55"
        fill="none"
      />
      <path
        d="M 17 9.5 Q 22 6.5 26 11"
        stroke={`url(#${id})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* The ball — at the arc's leading tip */}
      <g>
        <circle
          cx="26"
          cy="11"
          r="3"
          fill="rgb(var(--accent))"
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="0.6"
        />
        <path
          d="M23.7 10.4c1.4.35 3.2.35 4.6 0"
          stroke="rgb(var(--background))"
          strokeOpacity="0.85"
          strokeWidth="0.5"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
