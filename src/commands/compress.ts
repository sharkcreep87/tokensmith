import type { Command } from "commander";
import chalk from "chalk";
import type { Container } from "../container.js";
import { success, info, headline, tokenSaving } from "../cli/ui.js";
import { formatTokens, formatPercent } from "../utils/format.js";

export function registerCompressCommand(program: Command, getContainer: () => Container): void {
  const compress = program
    .command("compress")
    .description("Compress long session or project history into short summaries");

  compress
    .command("session <sessionId>")
    .description("Compress a single session")
    .option("--ratio <n>", "target ratio (0–1) of compressed/original tokens", (v) => parseFloat(v))
    .option("--keep <n>", "preserve last N messages verbatim", (v) => parseInt(v, 10))
    .action((sessionId: string, opts: { ratio?: number; keep?: number }) => {
      const container = getContainer();
      const result = container.services.compression.compress({
        scope: "session",
        sessionId,
        targetRatio: opts.ratio,
        keepLastMessages: opts.keep
      });
      process.stdout.write(headline(`Session compressed: ${sessionId}`) + "\n");
      process.stdout.write(
        success(
          `Original ${formatTokens(result.originalTokens)} → summary ${formatTokens(result.compressedTokens)} ${chalk.gray(`(${formatPercent(result.reductionPct)})`)}`
        ) + "\n"
      );
      process.stdout.write(tokenSaving(result.savedTokens, result.originalTokens) + "\n");
      process.stdout.write(
        info(`Summary id: ${chalk.bold(result.summary.id)}`) + "\n"
      );
    });

  compress
    .command("project")
    .description("Compress every session in the current namespace")
    .option("--ratio <n>", "target ratio (0–1)", (v) => parseFloat(v))
    .action((opts: { ratio?: number }) => {
      const container = getContainer();
      const result = container.services.compression.compress({
        scope: "project",
        targetRatio: opts.ratio
      });
      process.stdout.write(headline(`Project compressed: ${container.config.namespace}`) + "\n");
      process.stdout.write(
        success(
          `Original ${formatTokens(result.originalTokens)} → summary ${formatTokens(result.compressedTokens)} ${chalk.gray(`(${formatPercent(result.reductionPct)})`)}`
        ) + "\n"
      );
      process.stdout.write(tokenSaving(result.savedTokens, result.originalTokens) + "\n");
    });
}
