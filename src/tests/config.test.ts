import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config/index.js";

describe("config/loadConfig", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tokensmith-cfg-"));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    delete process.env.TOKENSMITH_TOKEN_MODEL;
    delete process.env.TOKENSMITH_COMPRESSION_THRESHOLD;
  });

  it("applies defaults without a config file", () => {
    const cfg = loadConfig({ cwd: projectRoot, overrides: { namespace: "x" } });
    expect(cfg.tokenModel).toBe("o200k_base");
    expect(cfg.namespace).toBe("x");
    expect(cfg.compression.threshold).toBeGreaterThan(0);
  });

  it("reads token-smith.config.json", () => {
    fs.writeFileSync(
      path.join(projectRoot, "token-smith.config.json"),
      JSON.stringify({ tokenModel: "cl100k_base", namespace: "custom" })
    );
    const cfg = loadConfig({ cwd: projectRoot });
    expect(cfg.tokenModel).toBe("cl100k_base");
    expect(cfg.namespace).toBe("custom");
  });

  it("env vars override file values", () => {
    fs.writeFileSync(
      path.join(projectRoot, "token-smith.config.json"),
      JSON.stringify({ tokenModel: "cl100k_base", namespace: "custom" })
    );
    process.env.TOKENSMITH_TOKEN_MODEL = "o200k_base";
    process.env.TOKENSMITH_COMPRESSION_THRESHOLD = "123";
    const cfg = loadConfig({ cwd: projectRoot });
    expect(cfg.tokenModel).toBe("o200k_base");
    expect(cfg.compression.threshold).toBe(123);
  });

  it("rejects invalid config files", () => {
    fs.writeFileSync(
      path.join(projectRoot, "token-smith.config.json"),
      JSON.stringify({ tokenModel: "not-a-model" })
    );
    expect(() => loadConfig({ cwd: projectRoot })).toThrow(/Invalid TokenSmith config/);
  });
});
