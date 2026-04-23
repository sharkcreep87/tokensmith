import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { cosmiconfigSync } from "cosmiconfig";
import dotenv from "dotenv";
import { configFileSchema, type ConfigFileInput } from "../types/schemas.js";
import type { LogLevel, TokenModel } from "../types/index.js";
import { detectGitNamespace } from "../utils/git.js";
import { ConfigError } from "../utils/errors.js";

/**
 * Resolved, fully-typed runtime configuration used by every service.
 * Produced by `loadConfig()` — consumers should never reach for env/files
 * directly.
 */
export interface ResolvedConfig {
  readonly dbPath: string;
  readonly projectRoot: string;
  readonly namespace: string;
  readonly tokenModel: TokenModel;
  readonly preferredModel: string;
  readonly autoSaveMemories: boolean;
  readonly logLevel: LogLevel;
  readonly compression: {
    threshold: number;
    targetRatio: number;
    keepLastMessages: number;
  };
  readonly context: {
    maxTokens: number;
    keywordWeight: number;
    recencyWeight: number;
    priorityWeight: number;
    includeSkills: boolean;
    includeMemories: boolean;
    includeSummaries: boolean;
    minInjectionScore: number;
  };
  readonly grounding: {
    mode: "strict" | "normal" | "off";
    verbatimCritical: boolean;
    includeHeader: boolean;
    citeSources: boolean;
  };
  readonly performance: {
    hookBudgetMs: number;
    sessionStartBudgetMs: number;
    toolHookBudgetMs: number;
    sessionEndBudgetMs: number;
    disabled: boolean;
  };
  readonly analytics: {
    baselineModel: string;
    warningTokens: number;
  };
  readonly color: boolean;
}

export interface LoadConfigOptions {
  cwd?: string;
  overrides?: Partial<ConfigFileInput> & { dbPath?: string };
  searchFromEnv?: boolean;
}

const CONFIG_MODULE = "tokensmith";
const ENV_PREFIX = "TOKENSMITH_";

const DEFAULTS: ResolvedConfig = {
  dbPath: "",
  projectRoot: "",
  namespace: "default",
  tokenModel: "o200k_base",
  preferredModel: "claude-sonnet-4-6",
  autoSaveMemories: false,
  logLevel: "info",
  compression: {
    threshold: 8000,
    targetRatio: 0.2,
    keepLastMessages: 4
  },
  context: {
    maxTokens: 4000,
    keywordWeight: 0.6,
    recencyWeight: 0.25,
    priorityWeight: 0.15,
    includeSkills: true,
    includeMemories: true,
    includeSummaries: true,
    // Below this blended score we decline to inject an item — silence is
    // better than bad context. 0.12 ≈ "at least one strong keyword match or
    // a critical-priority item".
    minInjectionScore: 0.12
  },
  grounding: {
    mode: "strict",
    verbatimCritical: true,
    includeHeader: true,
    citeSources: true
  },
  performance: {
    // Hard ceilings chosen to stay well under each hook's outer Claude Code
    // timeout (see hooks/hooks.json). If the work doesn't finish within the
    // budget we fail open with an empty response.
    hookBudgetMs: 250,
    sessionStartBudgetMs: 150,
    toolHookBudgetMs: 100,
    sessionEndBudgetMs: 1000,
    disabled: false
  },
  analytics: {
    baselineModel: "claude-sonnet-4-6",
    warningTokens: 80000
  },
  color: true
};

function parseBoolEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return undefined;
}

function parseIntEnv(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function readConfigFile(cwd: string): ConfigFileInput {
  const explorer = cosmiconfigSync(CONFIG_MODULE, {
    searchPlaces: [
      "token-smith.config.json",
      "tokensmith.config.json",
      ".tokensmithrc",
      ".tokensmithrc.json",
      "package.json"
    ]
  });
  const result = explorer.search(cwd);
  if (!result || result.isEmpty) return {};
  const parsed = configFileSchema.safeParse(result.config);
  if (!parsed.success) {
    throw new ConfigError(
      `Invalid TokenSmith config at ${result.filepath}: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
}

function resolveNamespace(
  cwd: string,
  configured: string | undefined
): string {
  if (configured && configured !== "auto") return configured;
  return detectGitNamespace(cwd) ?? path.basename(path.resolve(cwd)) ?? "default";
}

function resolveDbPath(projectRoot: string, configured: string | undefined): string {
  if (configured && path.isAbsolute(configured)) return configured;
  if (configured) return path.resolve(projectRoot, configured);
  return path.resolve(projectRoot, ".tokensmith", "tokensmith.db");
}

/**
 * Compose the resolved configuration from (lowest → highest precedence):
 *  1. Built-in defaults
 *  2. token-smith.config.json in the project (cosmiconfig search)
 *  3. `.env` in the project root
 *  4. Process environment variables
 *  5. Programmatic overrides (useful in tests)
 */
export function loadConfig(options: LoadConfigOptions = {}): ResolvedConfig {
  const cwd = options.cwd ?? process.cwd();

  dotenv.config({ path: path.join(cwd, ".env"), override: false });

  const fileConfig = readConfigFile(cwd);

  const envConfig: ConfigFileInput = {
    dbPath: process.env[`${ENV_PREFIX}DB_PATH`] || undefined,
    projectRoot: process.env[`${ENV_PREFIX}PROJECT_ROOT`] || undefined,
    tokenModel: (process.env[`${ENV_PREFIX}TOKEN_MODEL`] as TokenModel) || undefined,
    preferredModel: process.env[`${ENV_PREFIX}PREFERRED_MODEL`] || undefined,
    autoSaveMemories: parseBoolEnv(process.env[`${ENV_PREFIX}AUTO_SAVE_MEMORIES`]),
    logLevel: (process.env[`${ENV_PREFIX}LOG_LEVEL`] as LogLevel) || undefined,
    compression: {
      threshold: parseIntEnv(process.env[`${ENV_PREFIX}COMPRESSION_THRESHOLD`])
    },
    analytics: {
      warningTokens: parseIntEnv(process.env[`${ENV_PREFIX}TOKEN_WARNING`])
    }
  };

  const merged: ConfigFileInput = {
    ...fileConfig,
    ...stripUndefined(envConfig),
    compression: {
      ...fileConfig.compression,
      ...stripUndefined(envConfig.compression ?? {})
    },
    context: { ...fileConfig.context },
    grounding: { ...fileConfig.grounding },
    performance: { ...fileConfig.performance },
    analytics: {
      ...fileConfig.analytics,
      ...stripUndefined(envConfig.analytics ?? {})
    },
    ...stripUndefined(options.overrides ?? {})
  };

  const projectRoot = path.resolve(merged.projectRoot ?? cwd);
  if (!fs.existsSync(projectRoot)) {
    throw new ConfigError(`projectRoot does not exist: ${projectRoot}`);
  }

  const namespace = resolveNamespace(projectRoot, merged.namespace);
  const dbPath = resolveDbPath(projectRoot, merged.dbPath);

  const forceNoColor =
    parseBoolEnv(process.env[`${ENV_PREFIX}NO_COLOR`]) === true ||
    process.env.NO_COLOR !== undefined;

  return {
    dbPath,
    projectRoot,
    namespace,
    tokenModel: merged.tokenModel ?? DEFAULTS.tokenModel,
    preferredModel: merged.preferredModel ?? DEFAULTS.preferredModel,
    autoSaveMemories: merged.autoSaveMemories ?? DEFAULTS.autoSaveMemories,
    logLevel: merged.logLevel ?? DEFAULTS.logLevel,
    compression: {
      threshold:
        merged.compression?.threshold ?? DEFAULTS.compression.threshold,
      targetRatio:
        merged.compression?.targetRatio ?? DEFAULTS.compression.targetRatio,
      keepLastMessages:
        merged.compression?.keepLastMessages ??
        DEFAULTS.compression.keepLastMessages
    },
    context: {
      maxTokens: merged.context?.maxTokens ?? DEFAULTS.context.maxTokens,
      keywordWeight:
        merged.context?.keywordWeight ?? DEFAULTS.context.keywordWeight,
      recencyWeight:
        merged.context?.recencyWeight ?? DEFAULTS.context.recencyWeight,
      priorityWeight:
        merged.context?.priorityWeight ?? DEFAULTS.context.priorityWeight,
      includeSkills:
        merged.context?.includeSkills ?? DEFAULTS.context.includeSkills,
      includeMemories:
        merged.context?.includeMemories ?? DEFAULTS.context.includeMemories,
      includeSummaries:
        merged.context?.includeSummaries ?? DEFAULTS.context.includeSummaries,
      minInjectionScore:
        merged.context?.minInjectionScore ?? DEFAULTS.context.minInjectionScore
    },
    grounding: {
      mode: merged.grounding?.mode ?? DEFAULTS.grounding.mode,
      verbatimCritical:
        merged.grounding?.verbatimCritical ?? DEFAULTS.grounding.verbatimCritical,
      includeHeader:
        merged.grounding?.includeHeader ?? DEFAULTS.grounding.includeHeader,
      citeSources:
        merged.grounding?.citeSources ?? DEFAULTS.grounding.citeSources
    },
    performance: {
      hookBudgetMs:
        merged.performance?.hookBudgetMs ?? DEFAULTS.performance.hookBudgetMs,
      sessionStartBudgetMs:
        merged.performance?.sessionStartBudgetMs ??
        DEFAULTS.performance.sessionStartBudgetMs,
      toolHookBudgetMs:
        merged.performance?.toolHookBudgetMs ??
        DEFAULTS.performance.toolHookBudgetMs,
      sessionEndBudgetMs:
        merged.performance?.sessionEndBudgetMs ??
        DEFAULTS.performance.sessionEndBudgetMs,
      disabled: merged.performance?.disabled ?? DEFAULTS.performance.disabled
    },
    analytics: {
      baselineModel:
        merged.analytics?.baselineModel ?? DEFAULTS.analytics.baselineModel,
      warningTokens:
        merged.analytics?.warningTokens ?? DEFAULTS.analytics.warningTokens
    },
    color: !forceNoColor
  };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export function defaultUserConfigDir(): string {
  return path.join(os.homedir(), ".tokensmith");
}
