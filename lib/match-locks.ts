export type MatchLockModule = "predictions" | "rivalry";

export type MatchLockLike = {
  startTime: Date | string;
  predictionLockExtensionMinutes?: number | null;
  rivalryLockExtensionMinutes?: number | null;
  predictionLockExtensionAppliedAt?: Date | string | null;
  rivalryLockExtensionAppliedAt?: Date | string | null;
};

export function getModuleLockDeadline(match: MatchLockLike, module: MatchLockModule) {
  const startTime = new Date(match.startTime);
  const extensionMinutes =
    module === "predictions"
      ? match.predictionLockExtensionMinutes ?? 0
      : match.rivalryLockExtensionMinutes ?? 0;
  const baseDeadline = new Date(startTime.getTime() + Math.max(0, extensionMinutes) * 60_000);

  const appliedAt =
    module === "predictions"
      ? match.predictionLockExtensionAppliedAt
      : match.rivalryLockExtensionAppliedAt;
  if (!appliedAt) return baseDeadline;

  const appliedAtDate = new Date(appliedAt);
  // If the extension was applied after the standard base deadline, extend from
  // that application time instead of the original match start.
  if (appliedAtDate.getTime() > baseDeadline.getTime()) {
    return new Date(appliedAtDate.getTime() + Math.max(0, extensionMinutes) * 60_000);
  }

  return baseDeadline;
}

export function isModuleLocked(match: MatchLockLike, module: MatchLockModule, now = new Date()) {
  return now.getTime() >= getModuleLockDeadline(match, module).getTime();
}