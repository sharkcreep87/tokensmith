import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";

describe("ContextService", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("prefers relevant memories and respects the token budget", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "payment-api",
      content: "Use Stripe connect for the payment API flow. Secret in vault.",
      tags: ["payments"],
      priority: "critical"
    });
    services.memory.save({
      key: "frontend-theme",
      content: "Use Tailwind with a dark theme",
      tags: ["frontend"],
      priority: "normal"
    });

    const bundle = services.context.build({
      query: "payment",
      tokenBudget: 4000
    });

    expect(bundle.memories.find((m) => m.key === "payment-api")).toBeTruthy();
    expect(bundle.tokenCount).toBeLessThanOrEqual(4000);
    expect(bundle.renderedText).toContain("payment-api");
  });

  it("falls back to an empty bundle when nothing matches", () => {
    const { services } = sandbox.container;
    const bundle = services.context.build({ query: "nothing at all" });
    expect(bundle.memories).toHaveLength(0);
    expect(bundle.skills).toHaveLength(0);
    expect(bundle.renderedText).toContain("No relevant stored context");
  });
});
