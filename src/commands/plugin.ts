import type { Command } from "commander";
import type { Container } from "../container.js";
import { runHook } from "../plugin/hooks.js";
import { info } from "../cli/ui.js";
import { isGloballyDisabled } from "../utils/perf.js";

/**
 * Hidden-ish "plugin" command group — invoked by the Claude Code hooks that
 * live under ./hooks/. Surfaces the same capabilities as the other commands
 * but in a machine-friendly, JSON-only shape.
 *
 * Safety contract: this command path MUST NEVER propagate an exception.
 * Claude Code treats a non-zero exit code from a hook as a failure and may
 * surface it to the user, so every failure is downgraded to a structured
 * `{ ok: false }` JSON response on stdout with a successful exit.
 */
export function registerPluginCommand(
  program: Command,
  getContainer: () => Container
): void {
  const plugin = program
    .command("plugin")
    .description("Claude Code plugin hooks (machine-invoked)");

  plugin
    .command("hook <event>")
    .description("Run a TokenSmith hook for a plugin event. Reads JSON payload from stdin.")
    .action(async (event: string) => {
      // Global kill switch — bypass even spinning up the container so the
      // hook adds essentially zero latency when TokenSmith is disabled.
      if (isGloballyDisabled()) {
        process.stdout.write(
          JSON.stringify({
            ok: true,
            event,
            data: { skipped: true, reason: "disabled" },
            injections: [],
            perf: { elapsedMs: 0, timedOut: false }
          }) + "\n"
        );
        return;
      }

      const payload = await readStdinJson();
      try {
        const container = getContainer();
        const result = await runHook(container, event, payload);
        process.stdout.write(JSON.stringify(result) + "\n");
      } catch (err) {
        // Absolute last-resort fallback: even container bootstrap failed.
        // Emit a well-formed JSON response so the harness never surfaces an
        // opaque error to the user.
        process.stdout.write(
          JSON.stringify({
            ok: false,
            event,
            error: (err as Error).message ?? String(err),
            injections: [],
            perf: { elapsedMs: 0, timedOut: false }
          }) + "\n"
        );
      }
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
            warningTokens: container.config.analytics.warningTokens,
            grounding: container.config.grounding,
            performance: container.config.performance,
            disabled: container.config.performance.disabled || isGloballyDisabled()
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
  const buf = await new Promise<string>((resolve) => {
    let data = "";
    const to = setTimeout(() => resolve(data), 200);
    to.unref?.();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      clearTimeout(to);
      resolve(data);
    });
    process.stdin.on("error", () => {
      clearTimeout(to);
      resolve(data);
    });
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
