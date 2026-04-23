import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";
import { computeSavings } from "../services/analytics.service.js";

describe("AnalyticsService", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("aggregates savings across kinds", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "note",
      content: "Important payment api notes",
      tags: [],
      priority: "critical"
    });
    services.context.build({ query: "payment" });

    const stats = services.analytics.stats();
    expect(stats.totalRaw).toBeGreaterThan(0);
    expect(stats.byKind.length).toBeGreaterThan(0);
    expect(stats.savings.saved).toBeGreaterThanOrEqual(0);
  });

  it("computeSavings handles zero raw tokens", () => {
    const s = computeSavings(0, 0);
    expect(s.saved).toBe(0);
    expect(s.reductionPct).toBe(0);
  });

  it("computeSavings clamps negative savings", () => {
    const s = computeSavings(100, 200);
    expect(s.saved).toBe(0);
  });
});
