import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";

describe("ContextService — grounding safeguards", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("prepends the grounding header so Claude knows how to treat the context", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "payment-api",
      content: "Use Stripe live keys only via Vault",
      tags: ["payments"],
      priority: "critical"
    });
    const bundle = services.context.build({ query: "payment secret" });
    expect(bundle.renderedText).toMatch(/TokenSmith grounded context/);
    expect(bundle.renderedText).toMatch(/Cite, don't invent/);
  });

  it("includes provenance ids so Claude can cite instead of hallucinate", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "payment-api",
      content: "Use Stripe live keys only via Vault",
      tags: ["payments"],
      priority: "critical"
    });
    const bundle = services.context.build({ query: "payment" });
    expect(bundle.renderedText).toMatch(/memory:/);
    expect(bundle.renderedText).toMatch(/priority=critical/);
  });

  it("renders critical memories verbatim (fenced) — never paraphrased", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "api-secret",
      content: "SECRET=abcd-1234-xyz",
      tags: ["secrets"],
      priority: "critical"
    });
    const bundle = services.context.build({ query: "api secret" });
    expect(bundle.renderedText).toMatch(/```\s*\nSECRET=abcd-1234-xyz\n```/);
  });

  it("drops weakly-related memories below the minInjectionScore floor", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "unrelated",
      content: "notes about frontend theming",
      tags: ["frontend"],
      priority: "normal"
    });
    const bundle = services.context.build({ query: "payment processing" });
    expect(bundle.memories).toHaveLength(0);
    // Strict grounding means an empty bundle renders as the empty string —
    // the plugin will decline to inject anything.
    expect(bundle.renderedText).toBe("");
  });

  it("critical memories survive the threshold even without keyword match", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "always-on",
      content: "Project invariant: never deploy on Fridays.",
      tags: [],
      priority: "critical"
    });
    const bundle = services.context.build({ query: "totally unrelated query" });
    expect(bundle.memories.map((m) => m.key)).toContain("always-on");
  });

  it("emits an empty bundle when grounding mode is off", () => {
    const sb = createTestSandbox();
    try {
      // deliberately bypass the readonly flag for this specific test
      (sb.container as unknown as { config: { grounding: { mode: string } } }).config.grounding.mode = "off";
      sb.container.services.memory.save({
        key: "anything",
        content: "hello world payment api",
        tags: [],
        priority: "critical"
      });
      const bundle = sb.container.services.context.build({ query: "payment" });
      expect(bundle.renderedText).toBe("");
      expect(bundle.memories).toHaveLength(0);
    } finally {
      sb.cleanup();
    }
  });
});
