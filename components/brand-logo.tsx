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
  // 32x32 viewBox. Uses currentColor for stumps + container, var(--accent) for the ball.
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
      {/* Rounded badge */}
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="8"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.25"
      />
      {/* Three stumps */}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="10.5" y1="11" x2="10.5" y2="24" />
        <line x1="15.5" y1="11" x2="15.5" y2="24" />
        <line x1="20.5" y1="11" x2="20.5" y2="24" />
      </g>
      {/* Two bails */}
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <line x1="9.5" y1="10.25" x2="16.5" y2="10.25" />
        <line x1="15.5" y1="10.25" x2="21.5" y2="10.25" />
      </g>
      {/* Cricket ball with seam */}
      <g>
        <circle
          cx="24.5"
          cy="8.5"
          r="3"
          fill="rgb(var(--accent))"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="0.75"
        />
        <path
          d="M22.2 7.6c1.4.4 3 .4 4.6 0"
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
