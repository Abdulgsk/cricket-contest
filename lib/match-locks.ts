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
  const minutesMs = Math.max(0, extensionMinutes) * 60_000;

  const appliedAt =
    module === "predictions"
      ? match.predictionLockExtensionAppliedAt
      : match.rivalryLockExtensionAppliedAt;

  // No applied-at stamp → just delay the original start by the extension.
  if (!appliedAt) return new Date(startTime.getTime() + minutesMs);

  // If the extension was applied AFTER the scheduled start (i.e. match was
  // already live when admin re-opened the window), the extension should run
  // from the moment it was applied — not from the original start. Otherwise
  // a live match with a small extension would re-lock almost immediately.
  const appliedAtDate = new Date(appliedAt);
  const effectiveStartMs =
    appliedAtDate.getTime() > startTime.getTime()
      ? appliedAtDate.getTime()
      : startTime.getTime();

  return new Date(effectiveStartMs + minutesMs);
}

export function isModuleLocked(match: MatchLockLike, module: MatchLockModule, now = new Date()) {
  return now.getTime() >= getModuleLockDeadline(match, module).getTime();
}