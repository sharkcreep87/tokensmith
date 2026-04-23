import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestSandbox, type TestSandbox } from "./helpers.js";
import { NotFoundError } from "../utils/errors.js";

describe("SkillService", () => {
  let sandbox: TestSandbox;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => sandbox.cleanup());

  it("registers and renders a skill", () => {
    const { services } = sandbox.container;
    services.skill.add({
      name: "greet",
      description: "say hi",
      template: "Hello {{name}}!",
      tags: ["demo"]
    });
    const run = services.skill.run({
      name: "greet",
      variables: { name: "Ada" }
    });
    expect(run.rendered).toBe("Hello Ada!");
    expect(run.missingVariables).toEqual([]);
    expect(run.tokenCount).toBeGreaterThan(0);
  });

  it("reports missing variables", () => {
    const { services } = sandbox.container;
    services.skill.add({
      name: "tpl",
      description: "",
      template: "{{a}} and {{b}}",
      tags: []
    });
    const run = services.skill.run({ name: "tpl", variables: { a: "x" } });
    expect(run.rendered).toBe("x and {{b}}");
    expect(run.missingVariables).toContain("b");
  });

  it("increments usage counter", () => {
    const { services } = sandbox.container;
    services.skill.add({
      name: "tpl",
      description: "",
      template: "hi",
      tags: []
    });
    services.skill.run({ name: "tpl", variables: {} });
    services.skill.run({ name: "tpl", variables: {} });
    const skill = services.skill.get("tpl");
    expect(skill.usageCount).toBe(2);
  });

  it("deletes skills", () => {
    const { services } = sandbox.container;
    services.skill.add({ name: "gone", description: "", template: "bye", tags: [] });
    services.skill.delete("gone");
    expect(() => services.skill.get("gone")).toThrow(NotFoundError);
  });
});
