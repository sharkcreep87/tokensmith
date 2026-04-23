import type { SessionMessage } from "../types/index.js";
import type { Repositories } from "../repositories/index.js";
import type { TokenCounter } from "../utils/tokens.js";
import type { ResolvedConfig } from "../config/index.js";

export interface AppendMessageInput {
  sessionId: string;
  role: SessionMessage["role"];
  content: string;
  namespace?: string;
}

/**
 * Thin wrapper over the session repository so hooks and services share a
 * single token-counting path.
 */
export class SessionService {
  public constructor(
    private readonly repos: Repositories,
    private readonly tokens: TokenCounter,
    private readonly config: ResolvedConfig
  ) {}

  public append(input: AppendMessageInput): SessionMessage {
    const namespace = input.namespace ?? this.config.namespace;
    const tokenCount = this.tokens.count(input.content);
    const message = this.repos.session.append({
      namespace,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      tokenCount
    });
    this.repos.usage.record({
      namespace,
      sessionId: input.sessionId,
      kind: "raw_prompt",
      rawTokens: tokenCount,
      effectiveTokens: tokenCount,
      metadata: { role: input.role }
    });
    return message;
  }

  public list(sessionId: string, namespace?: string): SessionMessage[] {
    return this.repos.session.listForSession(
      namespace ?? this.config.namespace,
      sessionId
    );
  }

  public totalTokens(sessionId: string, namespace?: string): number {
    return this.list(sessionId, namespace).reduce(
      (acc, m) => acc + m.tokenCount,
      0
    );
  }

  public sessions(namespace?: string): Array<{
    sessionId: string;
    tokens: number;
    messages: number;
    lastActivity: string;
  }> {
    return this.repos.session.summariseSessions(
      namespace ?? this.config.namespace
    );
  }
}
