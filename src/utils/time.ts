export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Linear decay of "recency score" over a configurable horizon.
 * Recent items score close to 1, items older than `horizonMs` score 0.
 */
export function recencyScore(
  timestampIso: string,
  horizonMs: number = 1000 * 60 * 60 * 24 * 30 // 30 days
): number {
  const t = new Date(timestampIso).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageMs = Date.now() - t;
  if (ageMs <= 0) return 1;
  if (ageMs >= horizonMs) return 0;
  return 1 - ageMs / horizonMs;
}
