import { z } from "zod";
import type { Container } from "../container.js";
import { parseOrThrow } from "../utils/validation.js";
import { isGloballyDisabled, measure, withTimeout } from "../utils/perf.js";

/**
 * Claude Code plugin hook handlers.
 *
 * These handlers are invoked by Claude Code at specific lifecycle points and
 * their runtime is part of the user-visible latency. We therefore enforce
 * two strict invariants:
 *
 *  1. **No hook blocks longer than its budget.** Every handler is wrapped in
 *     a `withTimeout()` race. If we don't finish in time we return a safe
 *     no-op response. Better to skip an injection than to slow down Claude.
 *
 *  2. **No hook throws to Claude Code.** Every error path is converted to a
 *     structured `{ ok: false, ... }` response. Hooks must never bubble an
 *     exception into the harness.
 *
 *  3. **Every hook is a no-op when `performance.disabled` or the env kill
 *     switch is set.** This gives operators an instant eject button.
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
  perf: { elapsedMs: number; timedOut: boolean };
}

export interface HookFailure {
  ok: false;
  event: string;
  error: string;
  perf: { elapsedMs: number; timedOut: boolean };
}

export type HookResponse = HookResult | HookFailure;

type HookReturn = Omit<HookResult, "perf"> | Omit<HookFailure, "perf">;

const EMPTY_RESULT = (event: string, elapsedMs: number, timedOut: boolean): HookResult => ({
  ok: true,
  event,
  data: { skipped: true, reason: timedOut ? "deadline" : "disabled" },
  injections: [],
  perf: { elapsedMs, timedOut }
});

export async function runHook(
  container: Container,
  event: string,
  payload: unknown
): Promise<HookResponse> {
  const started = performance.now();

  // Global kill switches are checked first so the disabled path never even
  // touches the validators or the DB.
  if (container.config.performance.disabled || isGloballyDisabled()) {
    return EMPTY_RESULT(event, performance.now() - started, false);
  }

  const budgetMs = budgetForEvent(container, event);

  try {
    const work = async (): Promise<HookResponse> => {
      const { value, elapsedMs } = await measure(() =>
        dispatch(container, event, payload)
      );
      container.logger.debug(`hook.${event} completed`, {
        ms: Math.round(elapsedMs)
      });
      const perf = { elapsedMs, timedOut: false };
      return value.ok ? { ...value, perf } : { ...value, perf };
    };

    const fallback: HookResponse = EMPTY_RESULT(
      event,
      performance.now() - started,
      true
    );
    const { value, timedOut } = await withTimeout(work, budgetMs, fallback);
    if (timedOut) {
      container.logger.warn(`hook.${event} timed out`, { budgetMs });
    }
    return value;
  } catch (err) {
    // Fail open — never propagate an exception into Claude Code's harness.
    const elapsedMs = performance.now() - started;
    container.logger.error(`hook.${event} failed`, {
      error: (err as Error).message
    });
    return {
      ok: false,
      event,
      error: (err as Error).message,
      perf: { elapsedMs, timedOut: false }
    };
  }
}

function budgetForEvent(container: Container, event: string): number {
  const perf = container.config.performance;
  switch (event as HookName) {
    case "session-start":
      return perf.sessionStartBudgetMs;
    case "user-prompt-submit":
      return perf.hookBudgetMs;
    case "before-tool-use":
    case "after-tool-use":
      return perf.toolHookBudgetMs;
    case "session-end":
      return perf.sessionEndBudgetMs;
    default:
      return perf.hookBudgetMs;
  }
}

async function dispatch(
  container: Container,
  event: string,
  payload: unknown
): Promise<HookReturn> {
  switch (event as HookName) {
    case "session-start":
      return handleSessionStart(
        container,
        parseOrThrow(sessionStartSchema, payload)
      );
    case "user-prompt-submit":
      return handleUserPrompt(container, parseOrThrow(userPromptSchema, payload));
    case "before-tool-use":
      return handleBeforeTool(container, parseOrThrow(toolUseSchema, payload));
    case "after-tool-use":
      return handleAfterTool(container, parseOrThrow(toolUseSchema, payload));
    case "session-end":
      return handleSessionEnd(
        container,
        parseOrThrow(sessionEndSchema, payload)
      );
    default:
      return { ok: false, event, error: `Unknown hook: ${event}` };
  }
}

function handleSessionStart(
  container: Container,
  payload: z.infer<typeof sessionStartSchema>
): Omit<HookResult, "perf"> {
  const namespace = container.config.namespace;
  container.logger.debug(`TokenSmith session started`, {
    sessionId: payload.sessionId,
    namespace
  });
  return {
    ok: true,
    event: "session-start",
    data: {
      namespace,
      dbPath: container.config.dbPath,
      compressionThreshold: container.config.compression.threshold,
      groundingMode: container.config.grounding.mode
    },
    injections: []
  };
}

function handleUserPrompt(
  container: Container,
  payload: z.infer<typeof userPromptSchema>
): Omit<HookResult, "perf"> {
  const bundle = container.services.context.build({
    query: payload.prompt,
    tokenBudget: container.config.context.maxTokens
  });

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
    metadata: { promptTokens, groundingMode: container.config.grounding.mode }
  });

  // Only inject when the bundle actually contains content. Empty injections
  // are worse than none: they add noise without information, and can nudge
  // the model to fabricate "remembered" context. See ContextService for the
  // confidence threshold that guards this.
  const injections =
    effective > 0 && bundle.renderedText.trim().length > 0
      ? [{ role: "system" as const, content: bundle.renderedText }]
      : [];

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
      container.logger.warn("auto-compression failed", {
        error: (err as Error).message
      });
    }
  }

  return {
    ok: true,
    event: "user-prompt-submit",
    data: {
      promptTokens,
      contextTokens: effective,
      savedTokens: saved,
      injectionCount: injections.length,
      autoCompression
    },
    injections
  };
}

function handleBeforeTool(
  container: Container,
  payload: z.infer<typeof toolUseSchema>
): Omit<HookResult, "perf"> {
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
): Omit<HookResult, "perf"> {
  const rendered = safeStringify(payload.output ?? "");
  if (rendered && container.config.autoSaveMemories && rendered.length > 500) {
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
): Omit<HookResult, "perf"> {
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
