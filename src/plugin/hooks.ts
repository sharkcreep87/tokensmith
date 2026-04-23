import { z } from "zod";
import type { Container } from "../container.js";
import { parseOrThrow } from "../utils/validation.js";

/**
 * Claude Code plugin hook handlers.
 *
 * Each handler receives a JSON payload (from stdin when run as a subprocess
 * hook) and returns a JSON response that the harness can consume. We keep
 * every hook strictly typed through Zod to guarantee the IO boundary stays
 * stable even if Claude Code extends the payload shape.
 */

export type HookName =
  | "session-start"
  | "user-prompt-submit"
  | "before-tool-use"
  | "after-tool-use"
  | "session-end";

const sessionStartSchema = z.object({
  sessionId: z.string().min(1),
  project: z.string().optional()
});

const userPromptSchema = z.object({
  sessionId: z.string().min(1),
  prompt: z.string().min(1),
  cwd: z.string().optional()
});

const toolUseSchema = z.object({
  sessionId: z.string().min(1),
  tool: z.string().min(1),
  input: z.unknown().optional(),
  output: z.unknown().optional()
});

const sessionEndSchema = z.object({
  sessionId: z.string().min(1),
  tokensUsed: z.number().int().nonnegative().optional()
});

export interface HookResult {
  ok: true;
  event: string;
  data: Record<string, unknown>;
  injections: Array<{ role: "system"; content: string }>;
}

export interface HookFailure {
  ok: false;
  event: string;
  error: string;
}

export type HookResponse = HookResult | HookFailure;

export async function runHook(
  container: Container,
  event: string,
  payload: unknown
): Promise<HookResponse> {
  try {
    switch (event as HookName) {
      case "session-start":
        return handleSessionStart(container, parseOrThrow(sessionStartSchema, payload));
      case "user-prompt-submit":
        return handleUserPrompt(container, parseOrThrow(userPromptSchema, payload));
      case "before-tool-use":
        return handleBeforeTool(container, parseOrThrow(toolUseSchema, payload));
      case "after-tool-use":
        return handleAfterTool(container, parseOrThrow(toolUseSchema, payload));
      case "session-end":
        return handleSessionEnd(container, parseOrThrow(sessionEndSchema, payload));
      default:
        return {
          ok: false,
          event,
          error: `Unknown hook: ${event}`
        };
    }
  } catch (err) {
    return {
      ok: false,
      event,
      error: (err as Error).message
    };
  }
}

function handleSessionStart(
  container: Container,
  payload: z.infer<typeof sessionStartSchema>
): HookResult {
  const namespace = container.config.namespace;
  container.logger.info(`TokenSmith session started`, { sessionId: payload.sessionId, namespace });
  return {
    ok: true,
    event: "session-start",
    data: {
      namespace,
      dbPath: container.config.dbPath,
      compressionThreshold: container.config.compression.threshold
    },
    injections: []
  };
}

function handleUserPrompt(
  container: Container,
  payload: z.infer<typeof userPromptSchema>
): HookResult {
  const bundle = container.services.context.build({
    query: payload.prompt,
    tokenBudget: container.config.context.maxTokens
  });

  // Record the prompt so analytics know how much "raw" would have been spent
  // without TokenSmith's injection.
  const promptTokens = container.tokens.count(payload.prompt);
  container.services.session.append({
    sessionId: payload.sessionId,
    role: "user",
    content: payload.prompt
  });

  const totalRaw =
    bundle.memories.reduce((a, m) => a + m.tokenCount, 0) +
    bundle.skills.reduce((a, s) => a + s.tokenCount, 0) +
    bundle.summaries.reduce((a, s) => a + s.compressedTokenCount, 0);
  const effective = bundle.tokenCount;
  const saved = Math.max(0, totalRaw - effective);

  container.repos.usage.record({
    namespace: container.config.namespace,
    sessionId: payload.sessionId,
    kind: "injection",
    rawTokens: totalRaw,
    effectiveTokens: effective,
    metadata: { promptTokens }
  });

  const injections =
    effective > 0
      ? [{ role: "system" as const, content: bundle.renderedText }]
      : [];

  // If the accumulated session is past the compression threshold, trigger
  // compression proactively so the next turn stays small.
  const sessionTokens = container.services.session.totalTokens(payload.sessionId);
  let autoCompression: Record<string, unknown> | null = null;
  if (container.services.compression.shouldAutoCompress(sessionTokens)) {
    try {
      const result = container.services.compression.compress({
        scope: "session",
        sessionId: payload.sessionId
      });
      autoCompression = {
        sessionId: payload.sessionId,
        savedTokens: result.savedTokens,
        summaryId: result.summary.id
      };
    } catch (err) {
      container.logger.warn("auto-compression failed", { error: (err as Error).message });
    }
  }

  return {
    ok: true,
    event: "user-prompt-submit",
    data: {
      promptTokens,
      contextTokens: effective,
      savedTokens: saved,
      autoCompression
    },
    injections
  };
}

function handleBeforeTool(
  container: Container,
  payload: z.infer<typeof toolUseSchema>
): HookResult {
  container.logger.debug("tool invoked", { tool: payload.tool });
  return {
    ok: true,
    event: "before-tool-use",
    data: { tool: payload.tool },
    injections: []
  };
}

function handleAfterTool(
  container: Container,
  payload: z.infer<typeof toolUseSchema>
): HookResult {
  const rendered = safeStringify(payload.output ?? "");
  if (rendered && container.config.autoSaveMemories && rendered.length > 500) {
    // Auto-capture significant tool outputs as "archive" memories so they
    // never get lost between sessions.
    const key = `tool-${payload.tool}-${Date.now()}`;
    container.services.memory.saveValidated({
      key,
      content: rendered.slice(0, 80_000),
      tags: ["auto", "tool-output", payload.tool],
      priority: "archive"
    });
  }
  return {
    ok: true,
    event: "after-tool-use",
    data: { tool: payload.tool },
    injections: []
  };
}

function handleSessionEnd(
  container: Container,
  payload: z.infer<typeof sessionEndSchema>
): HookResult {
  const totalSession = container.services.session.totalTokens(payload.sessionId);
  let summaryId: string | null = null;
  if (totalSession >= container.config.compression.threshold) {
    try {
      const result = container.services.compression.compress({
        scope: "session",
        sessionId: payload.sessionId
      });
      summaryId = result.summary.id;
    } catch {
      summaryId = null;
    }
  }
  return {
    ok: true,
    event: "session-end",
    data: {
      sessionTokens: totalSession,
      tokensUsed: payload.tokensUsed ?? null,
      summaryId
    },
    injections: []
  };
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
