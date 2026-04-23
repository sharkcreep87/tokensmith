import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { TokenSavings } from "../types/index.js";
import { formatTokens, formatPercent } from "../utils/format.js";

export function headline(title: string): string {
  return chalk.bold.cyan(`\n${title}\n${"─".repeat(title.length)}`);
}

export function success(msg: string): string {
  return `${chalk.green.bold("✔")} ${msg}`;
}

export function info(msg: string): string {
  return `${chalk.cyan("ℹ")} ${msg}`;
}

export function warn(msg: string): string {
  return `${chalk.yellow.bold("⚠")} ${msg}`;
}

export function error(msg: string): string {
  return `${chalk.red.bold("✖")} ${msg}`;
}

export function tokenSaving(saved: number, raw: number): string {
  const pct = raw > 0 ? saved / raw : 0;
  return `${chalk.yellow("⚡")} ${chalk.yellow.bold(formatTokens(saved))} tokens avoided ${chalk.gray(`(${formatPercent(pct)})`)}`;
}

export function contextLoaded(items: number, tokens: number): string {
  return `${chalk.magenta("🧠")} Relevant context loaded ${chalk.gray(`(${items} items, ${formatTokens(tokens)} tokens)`)}`;
}

export function savingsLine(label: string, s: TokenSavings): string {
  return `${chalk.bold(label)}: raw ${formatTokens(s.raw)} → effective ${formatTokens(s.effective)} (${chalk.green(formatPercent(s.reductionPct))} reduction)`;
}

export function withSpinner<T>(
  text: string,
  task: (spinner: Ora) => Promise<T> | T,
  opts: { color?: boolean } = {}
): Promise<T> {
  if (opts.color === false || process.env.NO_COLOR !== undefined) {
    return Promise.resolve(task(createSilentSpinner()));
  }
  const spinner = ora({ text, color: "cyan" }).start();
  return Promise.resolve(task(spinner))
    .then((result) => {
      if (spinner.isSpinning) spinner.stop();
      return result;
    })
    .catch((err) => {
      if (spinner.isSpinning) spinner.fail();
      throw err;
    });
}

function createSilentSpinner(): Ora {
  const noop = () => silent;
  const silent = {
    start: noop,
    stop: noop,
    succeed: noop,
    fail: noop,
    warn: noop,
    info: noop,
    text: "",
    isSpinning: false
  } as unknown as Ora;
  return silent;
}
