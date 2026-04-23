import type { Command } from "commander";
import type { Container } from "../container.js";
import { info, success, headline } from "../cli/ui.js";
import { formatDate, formatTokens, makeTable } from "../utils/format.js";

export function registerSessionCommand(program: Command, getContainer: () => Container): void {
  const session = program
    .command("session")
    .description("Inspect and record Claude Code session messages");

  session
    .command("append <sessionId>")
    .description("Append a message to a session (reads content from stdin by default)")
    .option("-r, --role <role>", "system | user | assistant | tool", "user")
    .option("-m, --message <text>", "inline message instead of stdin")
    .action(async (sessionId: string, opts: { role: "system" | "user" | "assistant" | "tool"; message?: string }) => {
      const container = getContainer();
      const content = opts.message ?? (await readStdin());
      if (!content) {
        process.stdout.write(info("No content provided; nothing appended.") + "\n");
        return;
      }
      const message = container.services.session.append({
        sessionId,
        role: opts.role,
        content
      });
      process.stdout.write(
        success(`Appended ${formatTokens(message.tokenCount)} tokens to ${sessionId}`) + "\n"
      );
    });

  session
    .command("list")
    .alias("ls")
    .description("Summarise sessions in the current namespace")
    .action(() => {
      const container = getContainer();
      const rows = container.services.session.sessions();
      if (rows.length === 0) {
        process.stdout.write(info("No sessions yet.") + "\n");
        return;
      }
      process.stdout.write(headline("Sessions") + "\n");
      const table = makeTable(["sessionId", "messages", "tokens", "lastActivity"]);
      for (const r of rows) {
        table.push([
          r.sessionId,
          r.messages.toString(),
          formatTokens(r.tokens),
          formatDate(r.lastActivity)
        ]);
      }
      process.stdout.write(table.toString() + "\n");
    });
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf.trim()));
    process.stdin.on("error", reject);
  });
}
