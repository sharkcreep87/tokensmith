import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";
import { runHook } from "../plugin/hooks.js";

describe("plugin hooks — performance + fail-safety", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
    delete process.env.TOKENSMITH_DISABLED;
  });

  it("returns a safe no-op when TOKENSMITH_DISABLED is set", async () => {
    process.env.TOKENSMITH_DISABLED = "1";
    const res = await runHook(sandbox.container, "user-prompt-submit", {
      sessionId: "s1",
      prompt: "anything at all"
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.injections).toHaveLength(0);
      expect(res.data.skipped).toBe(true);
    }
  });

  it("never throws to the caller even on validation failure", async () => {
    const res = await runHook(sandbox.container, "session-start", {
      /* missing sessionId */
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/sessionId/);
      // Importantly, we still got a structured response — no exception.
      expect(res.perf).toBeDefined();
    }
  });

  it("each hook attaches a perf telemetry block", async () => {
    const res = await runHook(sandbox.container, "session-start", {
      sessionId: "abc"
    });
    expect(res.perf.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(res.perf.timedOut).toBe(false);
  });

  it("injects nothing when grounding mode yields an empty bundle", async () => {
    const res = await runHook(sandbox.container, "user-prompt-submit", {
      sessionId: "s1",
      prompt: "absolutely no matches here"
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      // With the default strict grounding + confidence floor, an unknown
      // topic yields ZERO injections — protecting the user from stray
      // irrelevant context being injected into their prompt.
      expect(res.injections).toHaveLength(0);
    }
  });

  it("session-start stays within the budget on a cold DB", async () => {
    const res = await runHook(sandbox.container, "session-start", {
      sessionId: "cold-start"
    });
    expect(res.ok).toBe(true);
    // Generous ceiling: if this ever trips it's a real regression worth
    // investigating. Normal laptop runs should finish in <30ms.
    expect(res.perf.elapsedMs).toBeLessThan(500);
  });
});
