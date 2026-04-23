import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";
import { runHook } from "../plugin/hooks.js";

describe("plugin hooks", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox({
      compression: { threshold: 10_000, targetRatio: 0.2, keepLastMessages: 0 }
    });
  });

  afterEach(() => sandbox.cleanup());

  it("session-start returns namespace", async () => {
    const res = await runHook(sandbox.container, "session-start", { sessionId: "abc" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.namespace).toBe(sandbox.container.config.namespace);
    }
  });

  it("user-prompt-submit injects context when memories exist", async () => {
    sandbox.container.services.memory.save({
      key: "payment",
      content: "Stripe payment details and routing",
      tags: ["payments"],
      priority: "critical"
    });

    const res = await runHook(sandbox.container, "user-prompt-submit", {
      sessionId: "s1",
      prompt: "How do I wire up a payment endpoint?"
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.injections.length).toBeGreaterThan(0);
      expect(res.injections[0]?.role).toBe("system");
    }
  });

  it("returns a failure response for unknown events", async () => {
    const res = await runHook(sandbox.container, "nonsense", {});
    expect(res.ok).toBe(false);
  });

  it("rejects payloads that fail validation", async () => {
    const res = await runHook(sandbox.container, "session-start", {});
    expect(res.ok).toBe(false);
  });
});
