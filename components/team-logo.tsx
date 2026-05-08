import { teamLogo } from "@/lib/team-logos";

export function TeamLogo({
  name,
  size = 28,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const src = teamLogo(name);
  if (!src) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={`${name} logo`}
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block object-contain ${className}`}
    />
  );
}
