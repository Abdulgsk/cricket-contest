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
import { TeamLogo } from "@/components/team-logo";
import { formatDate } from "@/lib/utils";
import { requireRole, userHasFeature } from "@/lib/rbac";
import { isModuleLocked } from "@/lib/match-locks";

export default async function AdminMatchResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireRole("admin", "superadmin");
  const isSuperadmin = me.role === "superadmin";
  const canManageLockExtensions = userHasFeature(me, "match.lock.extend");
  const canManageMatch = userHasFeature(me, "matches.manage");
  const canManageResults = userHasFeature(me, "results.manage");
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

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold flex items-center flex-wrap gap-2">
              <TeamLogo name={match.teamA} size={32} />
              {match.teamA}
              <span className="text-muted-foreground text-sm">vs</span>
              <TeamLogo name={match.teamB} size={32} />
              {match.teamB}
            </h1>
            <p className="text-sm text-muted-foreground">{formatDate(match.startTime)}</p>
            {isSuperadmin && match.externalId && (
              <p className="text-xs text-muted-foreground mt-1 break-all">
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

      {canManageMatch && (
        <MatchModesPanel
          matchId={id}
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

      {canManageMatch && (
        <ContestUrlForm matchId={id} initial={match.contestUrl} />
      )}

      {canManageMatch && (
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

      {!predictionLocked && canManageResults && (
        <PredictionResetPanel
          matchId={id}
          canReset
          users={users.map((u) => ({
            id: String(u._id),
            username: u.username,
            handle: u.userId,
            hasPrediction: predUserIds.has(String(u._id)),
          }))}
        />
      )}

      {canManageMatch && (
        <CustomPoolEditor
          matchId={id}
          initial={pools.map((p) => ({
            id: String(p._id),
            question: p.question,
            options: p.options,
            pointsValue: p.pointsValue,
            scored: p.scored,
            correctOption: p.correctOption,
          }))}
        />
      )}

      {canManageResults && (
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
      )}
    </div>
  );
}
