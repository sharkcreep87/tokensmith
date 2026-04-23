import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";

describe("CompressionService", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("produces a summary smaller than the original session", () => {
    const { services } = sandbox.container;
    const sessionId = "session-1";
    const longTurn = (prefix: string) =>
      Array.from({ length: 20 })
        .map((_, i) => `${prefix} sentence number ${i} about the ${prefix} subject in depth.`)
        .join(" ");

    services.session.append({ sessionId, role: "user", content: longTurn("alpha") });
    services.session.append({ sessionId, role: "assistant", content: longTurn("beta") });
    services.session.append({ sessionId, role: "user", content: longTurn("gamma") });

    const result = services.compression.compress({
      scope: "session",
      sessionId,
      targetRatio: 0.2,
      keepLastMessages: 0
    });

    expect(result.compressedTokens).toBeGreaterThan(0);
    expect(result.compressedTokens).toBeLessThan(result.originalTokens);
    expect(result.summary.content.length).toBeGreaterThan(0);
  });

  it("shouldAutoCompress respects threshold", () => {
    const { services, config } = sandbox.container;
    expect(services.compression.shouldAutoCompress(config.compression.threshold + 10)).toBe(true);
    expect(services.compression.shouldAutoCompress(0)).toBe(false);
  });
});
