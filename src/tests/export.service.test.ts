import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";

describe("ExportService", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("round-trips memories and skills through export/import", () => {
    const { services } = sandbox.container;
    services.memory.save({ key: "note", content: "hello", tags: [], priority: "normal" });
    services.skill.add({
      name: "greet",
      description: "",
      template: "Hi {{n}}",
      tags: []
    });

    const bundlePath = path.join(sandbox.projectRoot, "bundle.json");
    services.export.exportToFile(bundlePath);
    expect(fs.existsSync(bundlePath)).toBe(true);

    services.memory.delete("note");
    services.skill.delete("greet");

    const result = services.export.importFromFile(bundlePath);
    expect(result.importedMemories).toBeGreaterThanOrEqual(1);
    expect(result.importedSkills).toBeGreaterThanOrEqual(1);
    expect(services.memory.get("note").content).toBe("hello");
  });
});
