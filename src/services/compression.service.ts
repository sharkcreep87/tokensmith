import type { SessionMessage, Summary } from "../types/index.js";
import { compressInputSchema } from "../types/schemas.js";
import type { Repositories } from "../repositories/index.js";
import type { TokenCounter } from "../utils/tokens.js";
import { extractiveSummary, splitSentences, truncateToChars } from "../utils/text.js";
import { parseOrThrow } from "../utils/validation.js";
import { NotFoundError } from "../utils/errors.js";
import type { ResolvedConfig } from "../config/index.js";

export interface CompressionResult {
  summary: Summary;
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  reductionPct: number;
}

export type SummariserFn = (
  messages: SessionMessage[],
  targetTokenCount: number,
  tokens: TokenCounter
) => string;

/**
 * Session compression. Long conversations are summarised down to a fraction
 * of their original token count. A pluggable `summariser` keeps this testable
 * and lets users wire in an LLM-backed summariser in production.
 */
export class CompressionService {
  public constructor(
    private readonly repos: Repositories,
    private readonly tokens: TokenCounter,
    private readonly config: ResolvedConfig,
    private readonly summariser: SummariserFn = defaultSummariser
  ) {}

  public compress(input: unknown): CompressionResult {
    const parsed = parseOrThrow(compressInputSchema, input);
    const namespace = parsed.namespace ?? this.config.namespace;
    const targetRatio =
      parsed.targetRatio ?? this.config.compression.targetRatio;
    const keepLastMessages =
      parsed.keepLastMessages ?? this.config.compression.keepLastMessages;

    if (parsed.scope === "session") {
      if (!parsed.sessionId) {
        throw new NotFoundError("Session", "<sessionId required>");
      }
      return this.compressSession(
        namespace,
        parsed.sessionId,
        targetRatio,
        keepLastMessages
      );
    }
    return this.compressProject(namespace, targetRatio);
  }

  private compressSession(
    namespace: string,
    sessionId: string,
    targetRatio: number,
    keepLastMessages: number
  ): CompressionResult {
    const all = this.repos.session.listForSession(namespace, sessionId);
    if (all.length === 0) {
      throw new NotFoundError("Session", sessionId);
    }

    const keepCount = Math.min(keepLastMessages, all.length);
    const toCompress = keepCount > 0 ? all.slice(0, all.length - keepCount) : all;
    const originalTokens = toCompress.reduce((acc, m) => acc + m.tokenCount, 0);
    if (originalTokens === 0) {
      throw new NotFoundError("SessionMessages", sessionId);
    }

    const targetTokenCount = Math.max(100, Math.floor(originalTokens * targetRatio));
    const summaryText = this.summariser(toCompress, targetTokenCount, this.tokens);
    const compressedTokens = this.tokens.count(summaryText);

    const summary = this.repos.summary.create({
      namespace,
      sessionId,
      scope: "session",
      title: `Session summary ${sessionId}`,
      content: summaryText,
      originalTokenCount: originalTokens,
      compressedTokenCount: compressedTokens
    });

    // Replace the compressed messages with a single "system" breadcrumb
    // so downstream prompts can cite the summary.
    for (const msg of toCompress) {
      this.repos.session.deleteSession(namespace, msg.sessionId);
      break; // deleteSession already removes every row for this session id
    }
    // Re-append the tail that we preserved.
    const tail = all.slice(all.length - keepCount);
    for (const msg of tail) {
      this.repos.session.append({
        namespace: msg.namespace,
        sessionId: msg.sessionId,
        role: msg.role,
        content: msg.content,
        tokenCount: msg.tokenCount
      });
    }

    const savedTokens = Math.max(0, originalTokens - compressedTokens);
    this.repos.usage.record({
      namespace,
      sessionId,
      kind: "compress",
      rawTokens: originalTokens,
      effectiveTokens: compressedTokens,
      metadata: { scope: "session" }
    });

    return {
      summary,
      originalTokens,
      compressedTokens,
      savedTokens,
      reductionPct: originalTokens ? savedTokens / originalTokens : 0
    };
  }

  private compressProject(
    namespace: string,
    targetRatio: number
  ): CompressionResult {
    const sessions = this.repos.session.summariseSessions(namespace);
    if (sessions.length === 0) {
      throw new NotFoundError("Project sessions", namespace);
    }
    const messages: SessionMessage[] = [];
    for (const s of sessions) {
      messages.push(
        ...this.repos.session.listForSession(namespace, s.sessionId)
      );
    }
    const originalTokens = messages.reduce((acc, m) => acc + m.tokenCount, 0);
    if (originalTokens === 0) {
      throw new NotFoundError("Project messages", namespace);
    }
    const targetTokenCount = Math.max(200, Math.floor(originalTokens * targetRatio));
    const summaryText = this.summariser(messages, targetTokenCount, this.tokens);
    const compressedTokens = this.tokens.count(summaryText);

    const summary = this.repos.summary.create({
      namespace,
      sessionId: `project:${namespace}`,
      scope: "project",
      title: `Project summary for ${namespace}`,
      content: summaryText,
      originalTokenCount: originalTokens,
      compressedTokenCount: compressedTokens
    });

    const savedTokens = Math.max(0, originalTokens - compressedTokens);
    this.repos.usage.record({
      namespace,
      kind: "compress",
      rawTokens: originalTokens,
      effectiveTokens: compressedTokens,
      metadata: { scope: "project" }
    });

    return {
      summary,
      originalTokens,
      compressedTokens,
      savedTokens,
      reductionPct: originalTokens ? savedTokens / originalTokens : 0
    };
  }

  public shouldAutoCompress(sessionTokenCount: number): boolean {
    return sessionTokenCount >= this.config.compression.threshold;
  }
}

/**
 * Default summariser — extractive ranking over sentences.
 *
 * This is a deterministic, offline summariser that never spends tokens on
 * another LLM call. In production you can inject an LLM-backed summariser via
 * the service constructor for better quality.
 */
export const defaultSummariser: SummariserFn = (messages, targetTokenCount, tokens) => {
  if (messages.length === 0) return "";
  const joined = messages
    .map((m) => `[${m.role}] ${m.content}`)
    .join("\n\n");

  // First pass: extractive summarisation by sentence.
  const approxSentenceTokens = 20;
  const maxSentences = Math.max(
    3,
    Math.floor(targetTokenCount / approxSentenceTokens)
  );
  const extractive = extractiveSummary(joined, maxSentences);

  // Guarantee we fit under the target token count.
  if (tokens.count(extractive) <= targetTokenCount) {
    return extractive;
  }

  // Fall back to greedy sentence-by-sentence inclusion until budget is hit.
  const sentences = splitSentences(extractive);
  const selected: string[] = [];
  let spent = 0;
  for (const s of sentences) {
    const t = tokens.count(s);
    if (spent + t > targetTokenCount) break;
    selected.push(s);
    spent += t;
  }
  const trimmed = selected.join(" ");
  return trimmed || truncateToChars(extractive, targetTokenCount * 4);
};
