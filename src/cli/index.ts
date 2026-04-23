#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { createContainer, type Container } from "../container.js";
import { registerMemoryCommand } from "../commands/memory.js";
import { registerSkillCommand } from "../commands/skill.js";
import { registerContextCommand } from "../commands/context.js";
import { registerCompressCommand } from "../commands/compress.js";
import { registerTokensCommand } from "../commands/tokens.js";
import { registerSessionCommand } from "../commands/session.js";
import { registerInitCommand } from "../commands/init.js";
import { registerCompletionCommand } from "../commands/completion.js";
import { registerPluginCommand } from "../commands/plugin.js";
import { TokenSmithError } from "../utils/errors.js";
import { error as errorLine } from "./ui.js";

const VERSION = "1.0.0";

/**
 * Build the CLI program. Exported so tests can inspect parsed commands.
 */
export function buildProgram(): { program: Command; getContainer: () => Container; dispose: () => void } {
  const program = new Command();
  program
    .name("tokensmith")
    .description(
      chalk.bold.cyan("TokenSmith") +
        " — persistent memory, reusable skills, and smart context for Claude Code."
    )
    .version(VERSION, "-v, --version", "Show version")
    .option("--db <path>", "override database path")
    .option("--namespace <name>", "override namespace")
    .option("--no-color", "disable color output")
    .option("--log-level <level>", "silent | error | warn | info | debug");

  let container: Container | null = null;
  const getContainer = (): Container => {
    if (container) return container;
    const opts = program.opts<{ db?: string; namespace?: string; logLevel?: string }>();
    container = createContainer({
      overrides: {
        ...(opts.db ? { dbPath: opts.db } : {}),
        ...(opts.namespace ? { namespace: opts.namespace } : {}),
        ...(opts.logLevel ? { logLevel: opts.logLevel as never } : {})
      }
    });
    return container;
  };
  const dispose = () => {
    if (container) {
      container.dispose();
      container = null;
    }
  };

  registerInitCommand(program, getContainer);
  registerMemoryCommand(program, getContainer);
  registerSkillCommand(program, getContainer);
  registerContextCommand(program, getContainer);
  registerCompressCommand(program, getContainer);
  registerTokensCommand(program, getContainer);
  registerSessionCommand(program, getContainer);
  registerPluginCommand(program, getContainer);
  registerCompletionCommand(program);

  return { program, getContainer, dispose };
}

export async function main(argv: string[]): Promise<number> {
  const { program, dispose } = buildProgram();
  try {
    await program.parseAsync(argv);
    return 0;
  } catch (err) {
    if (err instanceof TokenSmithError) {
      process.stderr.write(errorLine(err.message) + "\n");
      return err.exitCode;
    }
    process.stderr.write(errorLine((err as Error).message ?? String(err)) + "\n");
    return 1;
  } finally {
    dispose();
  }
}

// Running as a script (both `node dist/cli/index.js` and `tsx src/cli/index.ts`)?
const isEntry = (() => {
  try {
    const entryUrl = new URL(`file://${process.argv[1]}`).href;
    return import.meta.url === entryUrl;
  } catch {
    return false;
  }
})();

if (isEntry) {
  main(process.argv).then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}
