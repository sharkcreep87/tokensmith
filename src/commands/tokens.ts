import type { Command } from "commander";
import chalk from "chalk";
import type { Container } from "../container.js";
import { headline, info, warn, savingsLine } from "../cli/ui.js";
import { formatTokens, formatPercent, makeTable } from "../utils/format.js";

export function registerTokensCommand(program: Command, getContainer: () => Container): void {
  const tokens = program
    .command("tokens")
    .description("Token usage analytics and reports");

  tokens
    .command("stats")
    .description("Show overall token stats for the current namespace")
    .option("--json", "emit JSON")
    .action((opts: { json?: boolean }) => {
      const container = getContainer();
      const stats = container.services.analytics.stats();
      if (opts.json) {
        process.stdout.write(JSON.stringify(stats, null, 2) + "\n");
        return;
      }
      process.stdout.write(headline(`Token stats — ${stats.namespace}`) + "\n");
      process.stdout.write(savingsLine("Overall", stats.savings) + "\n");
      process.stdout.write(
        info(
          `${stats.eventCount} events · ${stats.sessionCount} sessions · model ${chalk.bold(container.config.preferredModel)}`
        ) + "\n"
      );

      if (stats.savings.effective > container.config.analytics.warningTokens) {
        process.stdout.write(
          warn(
            `Effective token usage ${formatTokens(stats.savings.effective)} exceeds warning threshold ${formatTokens(container.config.analytics.warningTokens)}`
          ) + "\n"
        );
      }

      if (stats.byKind.length) {
        const table = makeTable(["kind", "raw", "effective", "saved", "reduction", "events"]);
        for (const k of stats.byKind) {
          table.push([
            k.kind,
            formatTokens(k.rawTokens),
            formatTokens(k.effectiveTokens),
            chalk.green(formatTokens(k.savings.saved)),
            formatPercent(k.savings.reductionPct),
            k.eventCount.toString()
          ]);
        }
        process.stdout.write(table.toString() + "\n");
      }
    });

  tokens
    .command("report")
    .description("Show the last 14 days of token activity")
    .action(() => {
      const container = getContainer();
      const stats = container.services.analytics.stats();
      process.stdout.write(headline(`Token report — ${stats.namespace}`) + "\n");
      if (stats.perDay.length === 0) {
        process.stdout.write(info("No usage recorded yet.") + "\n");
        return;
      }
      const table = makeTable(["day", "raw", "effective", "saved", "events"]);
      for (const d of stats.perDay) {
        const saved = Math.max(0, d.rawTokens - d.effectiveTokens);
        table.push([
          d.day,
          formatTokens(d.rawTokens),
          formatTokens(d.effectiveTokens),
          chalk.green(formatTokens(saved)),
          d.eventCount.toString()
        ]);
      }
      process.stdout.write(table.toString() + "\n");
    });

  tokens
    .command("recent")
    .description("List the most recent usage events")
    .option("--limit <n>", "how many events", (v) => parseInt(v, 10), 20)
    .action((opts: { limit: number }) => {
      const container = getContainer();
      const events = container.services.analytics.recent(undefined, opts.limit);
      if (events.length === 0) {
        process.stdout.write(info("No recent events.") + "\n");
        return;
      }
      const table = makeTable(["when", "kind", "raw", "effective", "session"]);
      for (const e of events) {
        table.push([
          e.createdAt.replace("T", " ").slice(0, 19),
          e.kind,
          formatTokens(e.rawTokens),
          formatTokens(e.effectiveTokens),
          e.sessionId ?? "—"
        ]);
      }
      process.stdout.write(table.toString() + "\n");
    });
}
