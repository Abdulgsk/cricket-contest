import type { IMatchPlayer } from "@/models/Match";
import { Card } from "@/components/ui/card";

export function MatchPlayers({
  players,
  teamA,
  teamB,
  teamAShort,
  teamBShort,
}: {
  players?: IMatchPlayer[];
  teamA: string;
  teamB: string;
  teamAShort?: string;
  teamBShort?: string;
}) {
  if (!players?.length) return null;

  const hasTeamInfo = players.some((p) => p.teamShort);
  const groupA = hasTeamInfo
    ? players.filter((p) => !teamAShort || p.teamShort === teamAShort)
    : players;
  const groupB = hasTeamInfo
    ? players.filter(
        (p) => p.teamShort && p.teamShort !== teamAShort && (!teamBShort || p.teamShort === teamBShort)
      )
    : [];

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">🏏 Squads</h2>
        <span className="text-xs text-muted-foreground">{players.length} players</span>
      </div>
      {hasTeamInfo ? (
        <div className="grid md:grid-cols-2 gap-4">
          <TeamBlock label={teamA} players={groupA} />
          <TeamBlock label={teamB} players={groupB} />
        </div>
      ) : (
        <TeamBlock label={`${teamA} & ${teamB} combined`} players={groupA} />
      )}
    </Card>
  );
}

function TeamBlock({ label, players }: { label: string; players: IMatchPlayer[] }) {
  if (!players.length) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">{label}</h3>
      <ul className="space-y-1">
        {players.map((p) => (
          <li
            key={p.name}
            className={`flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1.5 text-sm ${
              p.keeper ? "glow" : ""
            }`}
          >
            <span className="flex gap-0.5 text-xs">
              {p.captain && <span title="Captain">👑</span>}
              {p.keeper && <span title="Wicket-keeper">🧤</span>}
              {p.overseas && <span title="Overseas">✈️</span>}
              {p.role === "BOWL" && <span title="Bowler">⚾</span>}
              {p.role === "BAT" && <span title="Batsman">🏏</span>}
              {p.role === "AR" && <span title="All-rounder">🏏⚾</span>}
            </span>
            <span className="flex-1 truncate">{p.name}</span>
            {p.role && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {p.role}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
