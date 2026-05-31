import Link from "next/link";
import { loadFantasyRosterAction, loadFantasyLeaderboardAction } from "@/actions/fantasy-team";
import { FantasyTeamPicker } from "@/components/fantasy-team-picker";
import { FantasyLiveBoard } from "@/components/fantasy-live-board";
import { Card } from "@/components/ui/card";
import { BackButton } from "@/components/back-button";

export const dynamic = "force-dynamic";

export default async function FantasyPickPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const data = await loadFantasyRosterAction(matchId);

  if (!data.ok) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <BackButton />
        <Card>
          <p className="text-danger font-medium">Couldn&apos;t load this match</p>
          <p className="text-sm text-muted-foreground mt-1">{data.error}</p>
          <Link href="/fantasy" className="text-sm text-primary underline mt-3 inline-block">
            ← Back to Fantasy
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <BackButton />
      <FantasyTeamPicker
        match={data.match}
        players={data.players}
        locked={data.locked}
        xiAnnounced={data.xiAnnounced}
        rosterNotice={data.rosterNotice}
        initialTeam={data.team}
      />
      {data.locked && <LiveBoard matchId={matchId} />}
    </div>
  );
}

async function LiveBoard({ matchId }: { matchId: string }) {
  const board = await loadFantasyLeaderboardAction(matchId);
  if (!board.ok) return null;
  return (
    <FantasyLiveBoard
      matchId={matchId}
      rows={board.rows}
      pointsComputedAt={board.pointsComputedAt}
      status={board.match.status}
    />
  );
}
