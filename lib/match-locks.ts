export type MatchLockModule = "predictions" | "rivalry";

export type MatchLockLike = {
  startTime: Date | string;
  predictionLockExtensionMinutes?: number | null;
  rivalryLockExtensionMinutes?: number | null;
};

export function getModuleLockDeadline(match: MatchLockLike, module: MatchLockModule) {
  const startTime = new Date(match.startTime);
  const extensionMinutes =
    module === "predictions"
      ? match.predictionLockExtensionMinutes ?? 0
      : match.rivalryLockExtensionMinutes ?? 0;
  return new Date(startTime.getTime() + Math.max(0, extensionMinutes) * 60_000);
}

export function isModuleLocked(match: MatchLockLike, module: MatchLockModule, now = new Date()) {
  return now.getTime() >= getModuleLockDeadline(match, module).getTime();
}