/**
 * Shared domain types for TokenSmith.
 *
 * Domain entities are intentionally kept separate from the Zod input schemas
 * (see `./schemas.ts`) so that IO validation stays decoupled from the internal
 * representation used by the service layer.
 */

export type Priority = "critical" | "normal" | "archive";

export type TokenModel = "cl100k_base" | "o200k_base";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface Memory extends Timestamped {
  id: string;
  namespace: string;
  key: string;
  content: string;
  tags: string[];
  priority: Priority;
  tokenCount: number;
  hash: string;
}

export interface Skill extends Timestamped {
  id: string;
  namespace: string;
  name: string;
  description: string;
  template: string;
  tags: string[];
  tokenCount: number;
  usageCount: number;
}

export interface Summary extends Timestamped {
  id: string;
  namespace: string;
  sessionId: string;
  scope: "session" | "project";
  title: string;
  content: string;
  originalTokenCount: number;
  compressedTokenCount: number;
}

export interface SessionMessage extends Timestamped {
  id: string;
  namespace: string;
  sessionId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tokenCount: number;
}

export interface UsageEvent extends Timestamped {
  id: string;
  namespace: string;
  sessionId: string | null;
  kind:
    | "memory_save"
    | "memory_load"
    | "skill_run"
    | "context_build"
    | "compress"
    | "raw_prompt"
    | "injection";
  rawTokens: number;
  effectiveTokens: number;
  metadata: Record<string, unknown>;
}

export interface TokenSavings {
  raw: number;
  effective: number;
  saved: number;
  reductionPct: number;
}

export interface ContextBundle {
  namespace: string;
  query: string;
  tokenBudget: number;
  memories: Memory[];
  skills: Skill[];
  summaries: Summary[];
  renderedText: string;
  tokenCount: number;
}

export interface SearchResult<T> {
  item: T;
  score: number;
}
