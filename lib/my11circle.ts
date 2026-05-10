function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeMy11circleName(value: string) {
  return normalizeName(value);
}
