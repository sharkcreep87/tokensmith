import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

describe("MemoryService", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("saves and retrieves a memory", () => {
    const { services } = sandbox.container;
    const saved = services.memory.save({
      key: "api-base",
      content: "Use https://api.example.com in dev",
      tags: ["api", "urls"],
      priority: "normal"
    });
    expect(saved.created).toBe(true);
    expect(saved.memory.tokenCount).toBeGreaterThan(0);

    const got = services.memory.get("api-base");
    expect(got.content).toContain("example.com");
    expect(got.tags).toEqual(["api", "urls"]);
  });

  it("upserts on duplicate key", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "note",
      content: "first",
      tags: [],
      priority: "normal"
    });
    const second = services.memory.save({
      key: "note",
      content: "second",
      tags: ["updated"],
      priority: "critical"
    });
    expect(second.created).toBe(false);
    expect(second.memory.content).toBe("second");
    expect(second.memory.priority).toBe("critical");
  });

  it("detects duplicate content under a different key", () => {
    const { services } = sandbox.container;
    services.memory.save({
      key: "note-a",
      content: "exact duplicate content",
      tags: [],
      priority: "normal"
    });
    const second = services.memory.save({
      key: "note-b",
      content: "exact duplicate content",
      tags: [],
      priority: "normal"
    });
    expect(second.duplicateOf?.key).toBe("note-a");
  });

  it("rejects invalid keys", () => {
    const { services } = sandbox.container;
    expect(() =>
      services.memory.save({ key: "has space", content: "x", tags: [], priority: "normal" })
    ).toThrow(ValidationError);
  });

  it("throws NotFoundError for missing keys", () => {
    const { services } = sandbox.container;
    expect(() => services.memory.get("missing")).toThrow(NotFoundError);
    expect(() => services.memory.delete("missing")).toThrow(NotFoundError);
  });

  it("search ranks by keyword overlap and priority", () => {
    const { services } = sandbox.container;
    services.memory.save({ key: "payment-api", content: "stripe integration details", tags: [], priority: "critical" });
    services.memory.save({ key: "auth", content: "oauth flow", tags: [], priority: "normal" });
    services.memory.save({ key: "payment-misc", content: "payment notes", tags: [], priority: "archive" });

    const results = services.memory.search("payment", 10);
    expect(results[0]?.item.key).toBe("payment-api");
    expect(results.map((r) => r.item.key)).toContain("payment-misc");
  });

  it("clean removes archived by default", () => {
    const { services } = sandbox.container;
    services.memory.save({ key: "keep", content: "a", tags: [], priority: "normal" });
    services.memory.save({ key: "drop", content: "b", tags: [], priority: "archive" });
    const removed = services.memory.clean({ archivedOnly: true });
    expect(removed).toBe(1);
    expect(services.memory.list()).toHaveLength(1);
  });
});
