/**
 * Performance safeguards.
 *
 * TokenSmith runs inside the critical path of every Claude Code turn through
 * its plugin hooks. We therefore enforce two invariants:
 *
 *   1. NO handler may block the session longer than `budgetMs`.
 *      We race every handler against a timer and, on expiry, return whatever
 *      fallback the caller supplies. Better to skip an injection than to
 *      delay the model response.
 *
 *   2. Every handler is `measure()`d so we can surface timings for tuning.
 *
 * The plugin intentionally never throws into Claude Code — failures are
 * downgraded to structured "no-op" responses. See `src/plugin/hooks.ts`.
 */

export class DeadlineExceededError extends Error {
  public readonly code = "E_DEADLINE";
  public constructor(public readonly budgetMs: number) {
    super(`Deadline exceeded (${budgetMs}ms)`);
    this.name = "DeadlineExceededError";
  }
}

/**
 * Race `task` against a hard deadline. Returns `fallback` if the deadline
 * expires first. The in-flight promise is still allowed to settle (we cannot
 * truly cancel it without an AbortController), but its result is discarded.
 */
export async function withTimeout<T>(
  task: () => Promise<T>,
  budgetMs: number,
  fallback: T
): Promise<{ value: T; timedOut: boolean }> {
  if (budgetMs <= 0) {
    return { value: await task(), timedOut: false };
  }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), budgetMs);
    timer.unref?.();
  });
  try {
    const winner = await Promise.race([
      task().then((value) => ({ value, timedOut: false as const })),
      timeout
    ]);
    if ("value" in winner) {
      return { value: winner.value, timedOut: false };
    }
    return { value: fallback, timedOut: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Measure a sync or async fn's duration. Returns both the result and the
 * elapsed time in milliseconds so the caller can attach it to logs/metrics.
 */
export async function measure<T>(
  fn: () => Promise<T> | T
): Promise<{ value: T; elapsedMs: number }> {
  const started = performance.now();
  const value = await fn();
  return { value, elapsedMs: performance.now() - started };
}

/**
 * Honour the global kill-switch env var. A single process.env read stays
 * cheap even when invoked thousands of times.
 */
export function isGloballyDisabled(): boolean {
  const raw = process.env.TOKENSMITH_DISABLED;
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
