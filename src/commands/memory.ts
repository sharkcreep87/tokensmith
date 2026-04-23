import type { Command } from "commander";
import chalk from "chalk";
import type { Container } from "../container.js";
import { success, info, warn, headline } from "../cli/ui.js";
import { formatDate, formatTokens, makeTable } from "../utils/format.js";
import { truncateToChars } from "../utils/text.js";
import type { Priority } from "../types/index.js";

export function registerMemoryCommand(program: Command, getContainer: () => Container): void {
  const memory = program
    .command("memory")
    .description("Persistent, namespaced memories saved to SQLite");

  memory
    .command("save <key> [content...]")
    .alias("set")
    .description("Save or update a memory")
    .option("-t, --tag <tag>", "tag (repeatable)", collect, [])
    .option("-p, --priority <priority>", "priority: critical | normal | archive", "normal")
    .option("-f, --file <path>", "read content from file instead of positional args")
    .option("--stdin", "read content from stdin")
    .action(async (key: string, contentParts: string[], opts: { tag: string[]; priority: Priority; file?: string; stdin?: boolean }) => {
      const container = getContainer();
      const content = await resolveContent(contentParts, opts.file, opts.stdin ?? false);
      const result = container.services.memory.save({
        key,
        content,
        tags: opts.tag,
        priority: opts.priority
      });
      process.stdout.write(
        success(
          `Memory ${result.created ? "saved" : "updated"}: ${chalk.bold(result.memory.key)} ${chalk.gray(`(${formatTokens(result.memory.tokenCount)} tokens)`)}`
        ) + "\n"
      );
      if (result.duplicateOf) {
        process.stdout.write(
          warn(`Duplicate content already stored as ${chalk.bold(result.duplicateOf.key)}`) + "\n"
        );
      }
    });

  memory
    .command("get <key>")
    .description("Print a memory")
    .action((key: string) => {
      const container = getContainer();
      const memoryItem = container.services.memory.get(key);
      process.stdout.write(headline(`Memory: ${memoryItem.key}`) + "\n");
      process.stdout.write(
        chalk.gray(`priority=${memoryItem.priority} tokens=${memoryItem.tokenCount} tags=[${memoryItem.tags.join(", ")}]`) + "\n\n"
      );
      process.stdout.write(memoryItem.content + "\n");
    });

  memory
    .command("list")
    .alias("ls")
    .description("List memories in the current namespace")
    .option("-q, --query <query>", "filter by keyword")
    .option("--limit <n>", "max rows", (v) => parseInt(v, 10), 50)
    .action((opts: { query?: string; limit: number }) => {
      const container = getContainer();
      const memories = opts.query
        ? container.services.memory
            .search(opts.query, opts.limit)
            .map((r) => r.item)
        : container.services.memory.list().slice(0, opts.limit);

      if (memories.length === 0) {
        process.stdout.write(info("No memories found.") + "\n");
        return;
      }

      const table = makeTable(["key", "priority", "tokens", "tags", "updated"]);
      for (const m of memories) {
        table.push([
          m.key,
          colorPriority(m.priority),
          formatTokens(m.tokenCount),
          truncateToChars(m.tags.join(", "), 24),
          formatDate(m.updatedAt)
        ]);
      }
      process.stdout.write(table.toString() + "\n");
    });

  memory
    .command("delete <key>")
    .alias("rm")
    .description("Delete a memory by key")
    .action((key: string) => {
      const container = getContainer();
      container.services.memory.delete(key);
      process.stdout.write(success(`Memory deleted: ${chalk.bold(key)}`) + "\n");
    });

  memory
    .command("clean")
    .description("Delete memories. Defaults to archived-only; pass --all to purge.")
    .option("--all", "remove every memory in the namespace")
    .action((opts: { all?: boolean }) => {
      const container = getContainer();
      const removed = container.services.memory.clean({ archivedOnly: !opts.all });
      process.stdout.write(
        success(`Removed ${chalk.bold(removed.toString())} memor${removed === 1 ? "y" : "ies"}`) + "\n"
      );
    });

  memory
    .command("export <path>")
    .description("Export memories (+ skills + summaries) to a JSON bundle")
    .action((targetPath: string) => {
      const container = getContainer();
      const written = container.services.export.exportToFile(targetPath);
      process.stdout.write(success(`Exported to ${chalk.bold(written)}`) + "\n");
    });

  memory
    .command("import <path>")
    .description("Import memories from a JSON bundle")
    .option("--overwrite", "overwrite existing entries")
    .action((sourcePath: string, opts: { overwrite?: boolean }) => {
      const container = getContainer();
      const result = container.services.export.importFromFile(sourcePath, {
        overwrite: opts.overwrite
      });
      process.stdout.write(
        success(
          `Imported ${result.importedMemories} memories, ${result.importedSkills} skills, ${result.importedSummaries} summaries (${result.skippedDuplicates} duplicates skipped)`
        ) + "\n"
      );
    });
}

function collect(value: string, prev: string[]): string[] {
  return [...prev, value];
}

function colorPriority(p: Priority): string {
  if (p === "critical") return chalk.red.bold(p);
  if (p === "archive") return chalk.gray(p);
  return chalk.cyan(p);
}

async function resolveContent(
  positional: string[],
  filePath: string | undefined,
  fromStdin: boolean
): Promise<string> {
  if (filePath) {
    const { readFile } = await import("node:fs/promises");
    return (await readFile(filePath, "utf8")).trim();
  }
  if (fromStdin) {
    return await readStdin();
  }
  return positional.join(" ").trim();
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf.trim()));
    process.stdin.on("error", reject);
  });
}
