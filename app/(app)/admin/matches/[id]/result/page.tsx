import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Match } from "@/models/Match";
import { User } from "@/models/User";
import { MatchResult } from "@/models/MatchResult";
import { CustomPool } from "@/models/CustomPool";
import { Prediction } from "@/models/Prediction";
import { Card } from "@/components/ui/card";
import { ResultEntryForm } from "@/components/admin/result-entry-form";
import { CustomPoolEditor } from "@/components/admin/custom-pool-editor";
import { RefreshSquadsButton } from "@/components/admin/refresh-squads-button";
import { MatchModesPanel } from "@/components/admin/match-modes-panel";
import { PredictionResetPanel } from "@/components/admin/prediction-reset-panel";
import { ContestUrlForm } from "@/components/admin/contest-url-form";
import { MatchBountyPanel } from "@/components/admin/match-bounty-panel";
import { MatchLockExtensionsPanel } from "@/components/admin/match-lock-extensions-panel";
import { MatchAdminTabs } from "@/components/admin/match-admin-tabs";
import { TeamLogo } from "@/components/team-logo";
import { formatDate } from "@/lib/utils";
import { requireAdminAccess, userHasFeature } from "@/lib/rbac";
import { isModuleLocked } from "@/lib/match-locks";

export default async function AdminMatchResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireAdminAccess();
  const isSuperadmin = me.role === "superadmin";
  const canManageLockExtensions = userHasFeature(me, "match.lock.extend");
  const canManageMatch = userHasFeature(me, "matches.manage");
  const canManageBounty = userHasFeature(me, "match.bounty.manage");
  const canManageResults = userHasFeature(me, "results.manage");
  // Route access is enforced by app/(app)/admin/layout.tsx.
  const { id } = await params;
  await connectDB();
  const match = await Match.findById(id).lean();
  if (!match) notFound();
  const users = await User.find().sort({ username: 1 }).lean();
  const existing = await MatchResult.find({ matchId: id }).lean();
  const existingMap = new Map(existing.map((e) => [String(e.userId), e]));
  const pools = await CustomPool.find({ matchId: id }).lean();
  const preds = await Prediction.find({ matchId: id })
    .select("userId winner topBatter topBowler correctWinner correctBatter correctBowler")
    .lean();
  const predUserIds = new Set(preds.map((p) => String(p.userId)));

  // Fallback for legacy matches scored before Match.predictionTopBatter/Bowler existed:
  // recover the official answer from any scored Prediction marked correct.
  const inferred = {
    winner: match.matchWinner ?? "",
    topBatter: match.predictionTopBatter ?? "",
    topBowler: match.predictionTopBowler ?? "",
  };
  if (!inferred.winner) {
    inferred.winner = preds.find((p) => p.correctWinner)?.winner ?? "";
  }
  if (!inferred.topBatter) {
    inferred.topBatter = preds.find((p) => p.correctBatter)?.topBatter ?? "";
  }
  if (!inferred.topBowler) {
    inferred.topBowler = preds.find((p) => p.correctBowler)?.topBowler ?? "";
  }

  const predictionLocked = isModuleLocked(match, "predictions");

  // Build each tab as server-rendered JSX, then hand the nodes to the client
  // tab strip. Keeping the heavy data fetches server-side means each panel is
  // statically rendered and just toggled by the client wrapper.
  const setupTab = (
    <>
      {canManageMatch && (
        <MatchModesPanel
          matchId={id}
          isSuperadmin={isSuperadmin}
          resultsEntered={!!match.resultsEntered}
          disabled={match.resultsEntered}
          initial={{
            doublePoints: match.doublePoints,
            chaosMatch: match.chaosMatch,
            noBonus: match.noBonus,
            predictionMadness: match.predictionMadness,
          }}
        />
      )}
      {canManageLockExtensions && (
        <MatchLockExtensionsPanel
          matchId={id}
          startTime={match.startTime}
          initial={{
            predictionLockExtensionMinutes: match.predictionLockExtensionMinutes,
            rivalryLockExtensionMinutes: match.rivalryLockExtensionMinutes,
            predictionLockExtensionAppliedAt: match.predictionLockExtensionAppliedAt ?? null,
            rivalryLockExtensionAppliedAt: match.rivalryLockExtensionAppliedAt ?? null,
          }}
        />
      )}
      {canManageMatch && <ContestUrlForm matchId={id} initial={match.contestUrl} />}
      {canManageBounty && (
        <MatchBountyPanel
          matchId={id}
          initialBountyUserId={match.bountyUserId ? String(match.bountyUserId) : ""}
          initialReason={match.bountyReason ?? ""}
          users={users.map((u) => ({
            id: String(u._id),
            name: u.username,
            handle: u.userId,
          }))}
        />
      )}
    </>
  );

  const poolsTab = canManageMatch ? (
    <CustomPoolEditor
      matchId={id}
      matchStart={match.startTime ? new Date(match.startTime).toISOString() : null}
      initial={pools.map((p) => ({
        id: String(p._id),
        question: p.question,
        options: p.options,
        pointsValue: p.pointsValue,
        scored: p.scored,
        correctOption: p.correctOption,
        closesAt: p.closesAt ? new Date(p.closesAt).toISOString() : undefined,
      }))}
    />
  ) : null;

  const predictionsTab =
    canManageResults && (!predictionLocked || isSuperadmin) ? (
      <PredictionResetPanel
        matchId={id}
        canReset
        isSuperadmin={isSuperadmin}
        users={users.map((u) => ({
          id: String(u._id),
          username: u.username,
          handle: u.userId,
          hasPrediction: predUserIds.has(String(u._id)),
        }))}
      />
    ) : null;

  const resultsTab = canManageResults ? (
    <ResultEntryForm
      matchId={id}
      teamA={match.teamA}
      teamB={match.teamB}
      players={(match.players ?? []).map((p) => p.name)}
      playerInfo={(match.players ?? []).map((p) => ({
        name: p.name,
        role: p.role,
        keeper: p.keeper,
      }))}
      contestLinked={!!match.contestUrl}
      resultsEntered={!!match.resultsEntered}
      isSuperadmin={isSuperadmin}
      existingPrediction={inferred}
      existingScoreSummary={match.scoreSummary ?? ""}
      pools={pools.map((p) => ({
        id: String(p._id),
        question: p.question,
        options: p.options,
        scored: p.scored,
        correctOption: p.correctOption,
      }))}
      users={users.map((u) => ({
        id: String(u._id),
        username: u.username,
        handle: u.userId,
        my11circleName: u.my11circleName,
        existing: existingMap.get(String(u._id))
          ? {
              rank: existingMap.get(String(u._id))!.rank,
              fp: existingMap.get(String(u._id))!.fantasyPoints,
            }
          : undefined,
      }))}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-primary/8 via-card to-card border-border/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center flex-wrap gap-2">
              <TeamLogo name={match.teamA} size={32} />
              {match.teamA}
              <span className="text-muted-foreground text-sm">vs</span>
              <TeamLogo name={match.teamB} size={32} />
              {match.teamB}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {formatDate(match.startTime)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {match.resultsEntered && (
                <span className="rounded-full bg-success/15 text-success px-2 py-0.5 font-medium">
                  ✓ Results published
                </span>
              )}
              {!match.resultsEntered && (
                <span className="rounded-full bg-muted/60 text-muted-foreground px-2 py-0.5">
                  Awaiting results
                </span>
              )}
              {match.doublePoints && (
                <span className="rounded-full bg-warning/15 text-warning px-2 py-0.5">2×</span>
              )}
              {match.noBonus && (
                <span className="rounded-full bg-muted/60 text-muted-foreground px-2 py-0.5">No Bonus</span>
              )}
              {match.chaosMatch && (
                <span className="rounded-full bg-danger/15 text-danger px-2 py-0.5">Chaos</span>
              )}
              {match.predictionMadness && (
                <span className="rounded-full bg-accent/15 text-accent-foreground px-2 py-0.5">
                  Madness
                </span>
              )}
              {pools.length > 0 && (
                <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5">
                  {pools.length} pool{pools.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {isSuperadmin && match.externalId && (
              <p className="text-[11px] text-muted-foreground mt-1.5 break-all">
                Source id: <code>{match.externalId}</code> · Players: {match.players?.length ?? 0}
              </p>
            )}
          </div>
          {match.externalId && canManageMatch && (
            <div className="shrink-0">
              <RefreshSquadsButton matchId={id} />
            </div>
          )}
        </div>
      </Card>

      <MatchAdminTabs
        matchId={id}
        defaultKey={match.resultsEntered ? "results" : "setup"}
        tabs={[
          { key: "setup", label: "Setup", icon: "⚙️", node: setupTab },
          { key: "pools", label: "Pools", icon: "🎯", node: poolsTab },
          { key: "predictions", label: "Predictions", icon: "🔮", node: predictionsTab },
          { key: "results", label: "Results", icon: "🏆", node: resultsTab },
        ]}
      />
    </div>
  );
}
