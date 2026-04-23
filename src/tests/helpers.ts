import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContainer, type Container } from "../container.js";
import { createLogger } from "../utils/logger.js";

export interface TestSandbox {
  container: Container;
  projectRoot: string;
  dbPath: string;
  cleanup(): void;
}

/**
 * Spin up a disposable container backed by a temp-directory SQLite DB.
 * Tests that mutate state should always go through this helper to stay
 * hermetic — no shared /home/.tokensmith cross-contamination.
 */
export function createTestSandbox(
  overrides: Partial<import("../config/index.js").ResolvedConfig> = {}
): TestSandbox {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tokensmith-test-"));
  const dbPath = path.join(projectRoot, ".tokensmith", "test.db");
  const container = createContainer({
    cwd: projectRoot,
    logger: createLogger({ level: "silent", color: false }),
    overrides: {
      dbPath,
      projectRoot,
      namespace: overrides.namespace ?? "test-ns",
      compression: {
        threshold: overrides.compression?.threshold ?? 1000,
        targetRatio: overrides.compression?.targetRatio ?? 0.2,
        keepLastMessages: overrides.compression?.keepLastMessages ?? 0
      }
    }
  });
  return {
    container,
    projectRoot,
    dbPath,
    cleanup() {
      container.dispose();
      try {
        fs.rmSync(projectRoot, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  };
}
