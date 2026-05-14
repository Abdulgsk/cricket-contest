import { ContestMatchView } from "@/components/contest/contest-match-view";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ContestMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const me = await requireUser();
  return (
    <ContestMatchView
      matchId={matchId}
      meId={String(me._id)}
      meUsername={me.username}
    />
  );
}
