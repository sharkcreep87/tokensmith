import chalk from "chalk";
import Table from "cli-table3";
import type { TokenSavings } from "../types/index.js";

export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 1_000) return n.toString();
  if (abs < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return iso;
  }
}

export function formatSavings(s: TokenSavings, color = true): string {
  const c = color ? chalk : ({ green: (x: string) => x, gray: (x: string) => x } as unknown as typeof chalk);
  const saved = c.green(`${formatTokens(s.saved)} saved`);
  const pct = c.gray(`(${formatPercent(s.reductionPct)})`);
  return `${saved} ${pct}`;
}

export function makeTable(head: string[]): InstanceType<typeof Table> {
  return new Table({
    head: head.map((h) => chalk.bold.cyan(h)),
    chars: {
      top: "─", "top-mid": "┬", "top-left": "╭", "top-right": "╮",
      bottom: "─", "bottom-mid": "┴", "bottom-left": "╰", "bottom-right": "╯",
      left: "│", "left-mid": "├", mid: "─", "mid-mid": "┼",
      right: "│", "right-mid": "┤", middle: "│"
    },
    style: { head: [], border: ["gray"] }
  });
}
