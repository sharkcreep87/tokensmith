import { describe, expect, it } from "vitest";
import { withTimeout, measure, DeadlineExceededError } from "../utils/perf.js";

describe("utils/perf", () => {
  it("returns the value when under the budget", async () => {
    const res = await withTimeout(async () => 42, 500, -1);
    expect(res.value).toBe(42);
    expect(res.timedOut).toBe(false);
  });

  it("returns the fallback when the budget expires", async () => {
    const res = await withTimeout(
      () => new Promise<number>((resolve) => setTimeout(() => resolve(1), 80)),
      10,
      -7
    );
    expect(res.value).toBe(-7);
    expect(res.timedOut).toBe(true);
  });

  it("measure reports elapsed ms", async () => {
    const { value, elapsedMs } = await measure(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return "ok";
    });
    expect(value).toBe("ok");
    expect(elapsedMs).toBeGreaterThanOrEqual(3);
  });

  it("DeadlineExceededError carries budget info", () => {
    const e = new DeadlineExceededError(123);
    expect(e.code).toBe("E_DEADLINE");
    expect(e.budgetMs).toBe(123);
  });
});
