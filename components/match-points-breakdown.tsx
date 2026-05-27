import Link from "next/link";
import { Card, Badge } from "@/components/ui/card";
import { TeamLogo } from "@/components/team-logo";
import { formatDate } from "@/lib/utils";
import type {
  MatchPointsBreakdown,
  MatchPointsLine,
  LineGroup,
} from "@/services/match-breakdown";

/**
 * Single source of truth for rendering a per-match points breakdown.
 * Consumes the canonical `MatchPointsBreakdown` shape — adding a new line
 * type in the service surfaces here automatically (no UI change needed).
 *
 * Hides zero-point lines unless `alwaysShow` (e.g. wrong prediction we
 * still want to remember).
 */
export function MatchPointsBreakdownCard({
  breakdown,
}: {
  breakdown: MatchPointsBreakdown;
}) {
  const { match, matchId, rank, fantasyPoints, missed, specials, lines, total } =
    breakdown;

  // Group lines for the side-by-side mini panels.
  const groups = groupLines(lines);

  // Per-group subtotals — mirrored as quick-glance chips at the top, so the
  // breakdown of the headline `total` is visible without scrolling through
  // every panel.
  const groupSubtotals = GROUP_PANELS.map((panel) => {
    const panelLines = panel.groups.flatMap((g) => groups[g]);
    const visible = panelLines.filter((l) => l.points !== 0 || l.alwaysShow);
    const subtotal = visible.reduce((s, l) => s + l.points, 0);
    return { key: panel.key, label: panel.label, subtotal, visible };
  }).filter((p) => p.visible.length > 0);

  return (
    <Card className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link
          href={`/matches/${matchId}`}
          className="flex items-center gap-2 font-semibold hover:underline min-w-0"
        >
          <TeamLogo name={match.teamA} size={22} />
          <span className="truncate">{match.teamA}</span>
          <span className="text-muted-foreground text-xs">vs</span>
          <TeamLogo name={match.teamB} size={22} />
          <span className="truncate">{match.teamB}</span>
        </Link>
        <div className="text-xs text-muted-foreground" suppressHydrationWarning>
          {formatDate(match.startTime)}
        </div>
      </div>

      {/* Special-match chips */}
      {specials.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {specials.map((s) => (
            <span
              key={s.key}
              className="inline-flex flex-col items-start rounded-md border border-warning/40 bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-semibold"
              title={s.effect}
            >
              <span>{s.label}</span>
              <span className="text-[9px] font-normal opacity-80">
                {s.effect}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        {missed ? (
          <Badge tone="danger">Missed match</Badge>
        ) : rank > 0 ? (
          <Badge tone="accent">Rank #{rank}</Badge>
        ) : null}
        {fantasyPoints > 0 && (
          <Badge tone="default">{fantasyPoints} Dream11 pts</Badge>
        )}
        <Badge tone={total > 0 ? "success" : total < 0 ? "danger" : "default"}>
          Total: {total > 0 ? "+" : ""}
          {total}
        </Badge>
      </div>

      {/* Per-group subtotal chips — quick-glance breakdown of the headline
          Total without scrolling to each panel. */}
      {groupSubtotals.length > 1 && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {groupSubtotals.map((g) => {
            const tone =
              g.subtotal > 0
                ? "border-success/40 bg-success/10 text-success"
                : g.subtotal < 0
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-border bg-muted/30 text-muted-foreground";
            return (
              <span
                key={g.key}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium ${tone}`}
                title={`${g.label} subtotal`}
              >
                <span>{g.label}</span>
                <span className="tabular-nums font-semibold">
                  {g.subtotal > 0 ? "+" : ""}
                  {g.subtotal}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Group panels — only render groups that actually contributed */}
      <div className="grid sm:grid-cols-2 gap-2 text-xs">
        {GROUP_PANELS.map((panel) => {
          const groupLines = panel.groups.flatMap((g) => groups[g]);
          const visible = groupLines.filter(
            (l) => l.points !== 0 || l.alwaysShow,
          );
          if (visible.length === 0) return null;
          const subtotal = visible.reduce((s, l) => s + l.points, 0);
          return (
            <div
              key={panel.key}
              className={`rounded-lg bg-muted/30 p-2 ${
                panel.fullWidth ? "sm:col-span-2" : ""
              }`}
            >
              <div className="font-medium mb-1">{panel.label}</div>
              <div className="space-y-1">
                {visible.map((l) => (
                  <LineRow key={l.key} line={l} />
                ))}
                <div className="flex justify-between font-semibold pt-1 border-t border-border">
                  <span>Total</span>
                  <span
                    className={
                      subtotal > 0
                        ? "text-success"
                        : subtotal < 0
                          ? "text-danger"
                          : ""
                    }
                  >
                    {subtotal > 0 ? "+" : ""}
                    {subtotal}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function LineRow({ line }: { line: MatchPointsLine }) {
  const tone =
    line.points > 0
      ? "text-success"
      : line.points < 0
        ? "text-danger"
        : "text-muted-foreground";
  return (
    <div className="flex justify-between gap-3">
      <div className="min-w-0">
        <div className="break-words">
          <span className={tone === "text-muted-foreground" ? "text-foreground" : ""}>
            {line.points > 0 ? "+ " : line.points < 0 ? "\u2212 " : ""}
            {line.label}
          </span>
          {line.hint && (
            <span className="text-[10px] text-muted-foreground/70 ml-1">
              ({line.hint})
            </span>
          )}
        </div>
        {line.detail && (
          <div className="text-[10px] text-muted-foreground/80">
            {line.detail}
          </div>
        )}
      </div>
      <span className={`shrink-0 tabular-nums ${tone}`}>
        {line.points > 0 ? `+${line.points}` : line.points === 0 ? "0" : line.points}
      </span>
    </div>
  );
}

const GROUP_PANELS: {
  key: string;
  label: string;
  groups: LineGroup[];
  fullWidth?: boolean;
}[] = [
  { key: "league", label: "League core", groups: ["rank", "bonus", "bounty", "rivalry"] },
  { key: "cw", label: "Civil War", groups: ["civil_war", "captain"] },
  { key: "pred", label: "Predictions", groups: ["prediction"] },
  { key: "pool", label: "Custom pools", groups: ["custom_pool"], fullWidth: true },
  { key: "penalty", label: "Penalties", groups: ["penalty"] },
];

function groupLines(lines: MatchPointsLine[]): Record<LineGroup, MatchPointsLine[]> {
  const out: Record<LineGroup, MatchPointsLine[]> = {
    rank: [],
    bonus: [],
    bounty: [],
    rivalry: [],
    civil_war: [],
    captain: [],
    prediction: [],
    custom_pool: [],
    penalty: [],
  };
  for (const l of lines) out[l.group].push(l);
  return out;
}
