import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import type { Container } from "../container.js";
import { success, info, warn, headline } from "../cli/ui.js";

const DEFAULT_CONFIG = `{
  "dbPath": ".tokensmith/tokensmith.db",
  "projectRoot": ".",
  "namespace": "auto",
  "tokenModel": "o200k_base",
  "preferredModel": "claude-sonnet-4-6",
  "compression": {
    "threshold": 8000,
    "targetRatio": 0.2,
    "keepLastMessages": 4
  },
  "context": {
    "maxTokens": 4000,
    "keywordWeight": 0.6,
    "recencyWeight": 0.25,
    "priorityWeight": 0.15,
    "includeSkills": true,
    "includeMemories": true,
    "includeSummaries": true
  },
  "analytics": {
    "baselineModel": "claude-sonnet-4-6",
    "warningTokens": 80000
  },
  "autoSaveMemories": false,
  "logLevel": "info"
}
`;

export function registerInitCommand(program: Command, getContainer: () => Container): void {
  program
    .command("init")
    .description("Create a token-smith.config.json and .tokensmith DB in the current project")
    .option("--force", "overwrite existing config")
    .action((opts: { force?: boolean }) => {
      const container = getContainer();
      const configPath = path.join(container.config.projectRoot, "token-smith.config.json");
      if (fs.existsSync(configPath) && !opts.force) {
        process.stdout.write(
          warn(`Config already exists at ${configPath}; pass --force to overwrite.`) + "\n"
        );
      } else {
        fs.writeFileSync(configPath, DEFAULT_CONFIG, "utf8");
        process.stdout.write(success(`Wrote ${configPath}`) + "\n");
      }
      process.stdout.write(headline("TokenSmith ready") + "\n");
      process.stdout.write(
        info(`DB: ${container.config.dbPath}`) + "\n"
      );
      process.stdout.write(
        info(`Namespace: ${container.config.namespace}`) + "\n"
      );
    });
}
