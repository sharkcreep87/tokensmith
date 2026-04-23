import { z } from "zod";

/**
 * Zod schemas for all user-facing input boundaries (CLI, config, plugin hooks).
 *
 * These are the ONLY layer allowed to accept `unknown`. Every downstream
 * module receives strongly-typed, validated data.
 */

export const prioritySchema = z.enum(["critical", "normal", "archive"]);
export const tokenModelSchema = z.enum(["cl100k_base", "o200k_base"]);
export const logLevelSchema = z.enum(["silent", "error", "warn", "info", "debug"]);

/**
 * Keys, namespaces and skill names must be safe identifiers so they can be
 * safely used in paths, shell output, and SQL `LIKE` patterns. We disallow
 * any whitespace, path separators and shell metacharacters. SQL is always
 * parameterised, but defense-in-depth matters.
 */
const identifierSchema = z
  .string()
  .min(1, "must not be empty")
  .max(128, "must be <= 128 chars")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/,
    "may only contain letters, digits, '.', '_', ':' or '-' and must not start with a separator"
  );

export const memoryKeySchema = identifierSchema;
export const skillNameSchema = identifierSchema;
export const namespaceSchema = identifierSchema;

export const tagsSchema = z
  .array(
    z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9._:-]+$/, "tags may only contain letters, digits, '.', '_', ':' or '-'")
  )
  .max(32)
  .default([]);

export const memorySaveInputSchema = z.object({
  key: memoryKeySchema,
  content: z.string().min(1).max(200_000),
  tags: tagsSchema,
  priority: prioritySchema.default("normal"),
  namespace: namespaceSchema.optional()
});

export const memoryUpdateInputSchema = memorySaveInputSchema.partial().extend({
  key: memoryKeySchema
});

export const skillAddInputSchema = z.object({
  name: skillNameSchema,
  description: z.string().max(2_000).default(""),
  template: z.string().min(1).max(200_000),
  tags: tagsSchema,
  namespace: namespaceSchema.optional()
});

export const skillRunInputSchema = z.object({
  name: skillNameSchema,
  variables: z.record(z.string().min(1).max(128), z.string().max(20_000)).default({}),
  namespace: namespaceSchema.optional()
});

export const contextQueryInputSchema = z.object({
  query: z.string().min(1).max(2_000),
  tokenBudget: z.number().int().positive().max(200_000).optional(),
  namespace: namespaceSchema.optional(),
  includeSkills: z.boolean().optional(),
  includeMemories: z.boolean().optional(),
  includeSummaries: z.boolean().optional()
});

export const compressInputSchema = z.object({
  scope: z.enum(["session", "project"]),
  sessionId: z.string().optional(),
  targetRatio: z.number().positive().max(1).optional(),
  keepLastMessages: z.number().int().min(0).max(1000).optional(),
  namespace: namespaceSchema.optional()
});

export const configFileSchema = z.object({
  dbPath: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  namespace: z.union([namespaceSchema, z.literal("auto")]).optional(),
  tokenModel: tokenModelSchema.optional(),
  preferredModel: z.string().min(1).optional(),
  compression: z
    .object({
      threshold: z.number().int().positive().optional(),
      targetRatio: z.number().positive().max(1).optional(),
      keepLastMessages: z.number().int().min(0).optional()
    })
    .optional(),
  context: z
    .object({
      maxTokens: z.number().int().positive().optional(),
      keywordWeight: z.number().min(0).max(1).optional(),
      recencyWeight: z.number().min(0).max(1).optional(),
      priorityWeight: z.number().min(0).max(1).optional(),
      includeSkills: z.boolean().optional(),
      includeMemories: z.boolean().optional(),
      includeSummaries: z.boolean().optional(),
      minInjectionScore: z.number().min(0).max(1).optional()
    })
    .optional(),
  grounding: z
    .object({
      mode: z.enum(["strict", "normal", "off"]).optional(),
      verbatimCritical: z.boolean().optional(),
      includeHeader: z.boolean().optional(),
      citeSources: z.boolean().optional()
    })
    .optional(),
  performance: z
    .object({
      hookBudgetMs: z.number().int().positive().max(60_000).optional(),
      sessionStartBudgetMs: z.number().int().positive().max(60_000).optional(),
      toolHookBudgetMs: z.number().int().positive().max(60_000).optional(),
      sessionEndBudgetMs: z.number().int().positive().max(60_000).optional(),
      disabled: z.boolean().optional()
    })
    .optional(),
  analytics: z
    .object({
      baselineModel: z.string().optional(),
      warningTokens: z.number().int().positive().optional()
    })
    .optional(),
  autoSaveMemories: z.boolean().optional(),
  logLevel: logLevelSchema.optional()
});

export type ConfigFileInput = z.infer<typeof configFileSchema>;
export type MemorySaveInput = z.infer<typeof memorySaveInputSchema>;
export type MemoryUpdateInput = z.infer<typeof memoryUpdateInputSchema>;
export type SkillAddInput = z.infer<typeof skillAddInputSchema>;
export type SkillRunInput = z.infer<typeof skillRunInputSchema>;
export type ContextQueryInput = z.infer<typeof contextQueryInputSchema>;
export type CompressInput = z.infer<typeof compressInputSchema>;
