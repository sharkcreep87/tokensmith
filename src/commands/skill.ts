import type { Command } from "commander";
import chalk from "chalk";
import type { Container } from "../container.js";
import { success, info, warn, headline } from "../cli/ui.js";
import { formatDate, formatTokens, makeTable } from "../utils/format.js";
import { truncateToChars } from "../utils/text.js";

export function registerSkillCommand(program: Command, getContainer: () => Container): void {
  const skill = program
    .command("skill")
    .description("Reusable prompt templates ('skills')");

  skill
    .command("add <name>")
    .description("Create or update a skill")
    .option("-d, --description <desc>", "short description", "")
    .option("-f, --file <path>", "read template from file")
    .option("--stdin", "read template from stdin")
    .option("-t, --tag <tag>", "tag (repeatable)", collect, [])
    .option("--template <template>", "inline template body")
    .action(async (name: string, opts: { description: string; file?: string; stdin?: boolean; tag: string[]; template?: string }) => {
      const template = await resolveTemplate(opts);
      const container = getContainer();
      const created = container.services.skill.add({
        name,
        description: opts.description,
        template,
        tags: opts.tag
      });
      process.stdout.write(
        success(`Skill ${chalk.bold(created.name)} saved (${formatTokens(created.tokenCount)} tokens)`) + "\n"
      );
    });

  skill
    .command("run <name> [vars...]")
    .description("Render a skill. Variables may be passed as key=value pairs.")
    .option("--print-only", "do not record a usage event")
    .action((name: string, vars: string[], opts: { printOnly?: boolean }) => {
      const container = getContainer();
      const variables = parseVariables(vars);
      const result = container.services.skill.run({
        name,
        variables
      });
      process.stdout.write(headline(`Skill: ${result.skill.name}`) + "\n");
      if (result.missingVariables.length) {
        process.stdout.write(
          warn(`Unresolved placeholders: ${result.missingVariables.join(", ")}`) + "\n"
        );
      }
      process.stdout.write(result.rendered + "\n");
      if (!opts.printOnly) {
        process.stdout.write(
          info(`Rendered in ${formatTokens(result.tokenCount)} tokens`) + "\n"
        );
      }
    });

  skill
    .command("list")
    .alias("ls")
    .description("List skills")
    .action(() => {
      const container = getContainer();
      const skills = container.services.skill.list();
      if (skills.length === 0) {
        process.stdout.write(info("No skills defined yet.") + "\n");
        return;
      }
      const table = makeTable(["name", "tokens", "uses", "tags", "updated"]);
      for (const s of skills) {
        table.push([
          chalk.bold(s.name),
          formatTokens(s.tokenCount),
          s.usageCount.toString(),
          truncateToChars(s.tags.join(", "), 24),
          formatDate(s.updatedAt)
        ]);
      }
      process.stdout.write(table.toString() + "\n");
    });

  skill
    .command("delete <name>")
    .alias("rm")
    .description("Delete a skill")
    .action((name: string) => {
      const container = getContainer();
      container.services.skill.delete(name);
      process.stdout.write(success(`Skill deleted: ${chalk.bold(name)}`) + "\n");
    });
}

function collect(value: string, prev: string[]): string[] {
  return [...prev, value];
}

function parseVariables(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1);
    if (key) out[key] = value;
  }
  return out;
}

async function resolveTemplate(opts: {
  file?: string;
  stdin?: boolean;
  template?: string;
}): Promise<string> {
  if (opts.file) {
    const { readFile } = await import("node:fs/promises");
    return (await readFile(opts.file, "utf8")).trim();
  }
  if (opts.stdin) {
    return readStdin();
  }
  if (opts.template) return opts.template;
  throw new Error("Provide a template via --template, --file or --stdin");
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
