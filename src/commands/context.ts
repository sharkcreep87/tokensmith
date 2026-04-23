import type { Command } from "commander";
import chalk from "chalk";
import type { Container } from "../container.js";
import { contextLoaded, headline, info, tokenSaving } from "../cli/ui.js";
import { formatTokens } from "../utils/format.js";

export function registerContextCommand(program: Command, getContainer: () => Container): void {
  program
    .command("context <query...>")
    .description("Build a compressed, relevance-ranked context bundle for a query")
    .option("-b, --budget <tokens>", "token budget for the rendered bundle", (v) => parseInt(v, 10))
    .option("--no-memories", "exclude memories")
    .option("--no-skills", "exclude skills")
    .option("--no-summaries", "exclude summaries")
    .option("--json", "print raw JSON instead of formatted output")
    .action((queryParts: string[], opts: { budget?: number; memories?: boolean; skills?: boolean; summaries?: boolean; json?: boolean }) => {
      const container = getContainer();
      const bundle = container.services.context.build({
        query: queryParts.join(" "),
        tokenBudget: opts.budget,
        includeMemories: opts.memories,
        includeSkills: opts.skills,
        includeSummaries: opts.summaries
      });

      if (opts.json) {
        process.stdout.write(JSON.stringify(bundle, null, 2) + "\n");
        return;
      }

      process.stdout.write(headline(`Context bundle`) + "\n");
      process.stdout.write(
        info(
          `query=${chalk.bold(bundle.query)} namespace=${bundle.namespace} budget=${formatTokens(bundle.tokenBudget)}`
        ) + "\n"
      );
      const rawSum =
        bundle.memories.reduce((a, m) => a + m.tokenCount, 0) +
        bundle.skills.reduce((a, s) => a + s.tokenCount, 0) +
        bundle.summaries.reduce((a, s) => a + s.compressedTokenCount, 0);
      const saved = Math.max(0, rawSum - bundle.tokenCount);
      process.stdout.write(
        contextLoaded(
          bundle.memories.length + bundle.skills.length + bundle.summaries.length,
          bundle.tokenCount
        ) + "\n"
      );
      if (saved > 0) process.stdout.write(tokenSaving(saved, rawSum) + "\n");
      process.stdout.write("\n" + bundle.renderedText + "\n");
    });
}
