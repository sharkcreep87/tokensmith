import { describe, expect, it } from "vitest";
import { createTokenCounter } from "../utils/tokens.js";

describe("utils/tokens", () => {
  it("counts tokens deterministically", () => {
    const counter = createTokenCounter("o200k_base");
    const a = counter.count("The quick brown fox jumps over the lazy dog");
    const b = counter.count("The quick brown fox jumps over the lazy dog");
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it("truncateToBudget respects the budget", () => {
    const counter = createTokenCounter("o200k_base");
    const long = Array.from({ length: 200 }).fill("widget").join(" ");
    const truncated = counter.truncateToBudget(long, 10);
    expect(counter.count(truncated)).toBeLessThanOrEqual(10);
  });

  it("count handles empty strings", () => {
    const counter = createTokenCounter("o200k_base");
    expect(counter.count("")).toBe(0);
  });
});
