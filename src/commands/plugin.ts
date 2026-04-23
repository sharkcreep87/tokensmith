import type { Command } from "commander";
import type { Container } from "../container.js";
import { runHook } from "../plugin/hooks.js";
import { info } from "../cli/ui.js";

/**
 * Hidden-ish "plugin" command group — invoked by the Claude Code hooks that
 * live under ./hooks/. Surfaces the same capabilities as the other commands
 * but in a machine-friendly, JSON-only shape.
 */
export function registerPluginCommand(program: Command, getContainer: () => Container): void {
  const plugin = program
    .command("plugin")
    .description("Claude Code plugin hooks (machine-invoked)");

  plugin
    .command("hook <event>")
    .description("Run a TokenSmith hook for a plugin event. Reads JSON payload from stdin.")
    .action(async (event: string) => {
      const payload = await readStdinJson();
      const container = getContainer();
      const result = await runHook(container, event, payload);
      process.stdout.write(JSON.stringify(result) + "\n");
    });

  plugin
    .command("status")
    .description("Print a machine-readable status summary")
    .action(() => {
      const container = getContainer();
      process.stdout.write(
        JSON.stringify(
          {
            namespace: container.config.namespace,
            dbPath: container.config.dbPath,
            compressionThreshold: container.config.compression.threshold,
            warningTokens: container.config.analytics.warningTokens
          },
          null,
          2
        ) + "\n"
      );
      process.stdout.write(info("plugin healthy") + "\n");
    });
}

async function readStdinJson(): Promise<Record<string, unknown>> {
  if (process.stdin.isTTY) return {};
  const buf = await new Promise<string>((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
  if (!buf.trim()) return {};
  try {
    const parsed = JSON.parse(buf);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
