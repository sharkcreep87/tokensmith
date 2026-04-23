import chalk, { type ChalkInstance } from "chalk";
import type { LogLevel } from "../types/index.js";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

export interface Logger {
  readonly level: LogLevel;
  error: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  debug: (msg: string, meta?: unknown) => void;
  success: (msg: string, meta?: unknown) => void;
  child: (prefix: string) => Logger;
}

export interface LoggerOptions {
  level: LogLevel;
  color?: boolean;
  prefix?: string;
  sink?: (line: string) => void;
}

/**
 * Create a leveled logger that writes human-friendly output to stdout/stderr.
 * In CI or when NO_COLOR is set the logger automatically disables color.
 */
export function createLogger(opts: LoggerOptions): Logger {
  const colorEnabled = opts.color ?? true;
  const c = colorEnabled ? chalk : noColorChalk();
  const sink = opts.sink ?? ((line) => process.stderr.write(line + "\n"));

  const shouldLog = (level: LogLevel) =>
    LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[opts.level];

  const prefixStr = opts.prefix ? `${opts.prefix} ` : "";

  const fmt = (
    icon: string,
    tint: ChalkInstance,
    msg: string,
    meta?: unknown
  ) => {
    const body = `${tint(icon)} ${prefixStr}${msg}`;
    if (meta === undefined) return body;
    const pretty = typeof meta === "string" ? meta : JSON.stringify(meta);
    return `${body} ${c.gray(pretty)}`;
  };

  return {
    level: opts.level,
    error: (msg, meta) =>
      shouldLog("error") && sink(fmt("✖", c.red.bold, msg, meta)),
    warn: (msg, meta) =>
      shouldLog("warn") && sink(fmt("⚠", c.yellow.bold, msg, meta)),
    info: (msg, meta) =>
      shouldLog("info") && sink(fmt("ℹ", c.cyan, msg, meta)),
    debug: (msg, meta) =>
      shouldLog("debug") && sink(fmt("·", c.gray, msg, meta)),
    success: (msg, meta) =>
      shouldLog("info") && sink(fmt("✔", c.green.bold, msg, meta)),
    child: (prefix) =>
      createLogger({
        ...opts,
        prefix: opts.prefix ? `${opts.prefix}${prefix}` : prefix
      })
  };
}

function noColorChalk(): ChalkInstance {
  const identity = ((str: string) => str) as unknown as ChalkInstance;
  return new Proxy(identity, {
    get: () => identity
  });
}
