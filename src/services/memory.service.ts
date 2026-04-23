import type { Memory, SearchResult } from "../types/index.js";
import {
  memorySaveInputSchema,
  type MemorySaveInput
} from "../types/schemas.js";
import type { Repositories } from "../repositories/index.js";
import type { TokenCounter } from "../utils/tokens.js";
import { contentHash } from "../utils/hash.js";
import { keywordScore } from "../utils/text.js";
import { NotFoundError } from "../utils/errors.js";
import { parseOrThrow } from "../utils/validation.js";
import type { ResolvedConfig } from "../config/index.js";

export interface MemorySaveResult {
  memory: Memory;
  created: boolean;
  duplicateOf: Memory | null;
}

export class MemoryService {
  public constructor(
    private readonly repos: Repositories,
    private readonly tokens: TokenCounter,
    private readonly config: ResolvedConfig
  ) {}

  public save(input: unknown): MemorySaveResult {
    const parsed = parseOrThrow(memorySaveInputSchema, input);
    return this.saveValidated(parsed);
  }

  public saveValidated(input: MemorySaveInput): MemorySaveResult {
    const namespace = input.namespace ?? this.config.namespace;
    const hash = contentHash(input.content);
    const duplicate = this.repos.memory.findByHash(namespace, hash);
    const existing = this.repos.memory.findByKey(namespace, input.key);

    const memory = this.repos.memory.upsert({
      namespace,
      key: input.key,
      content: input.content,
      tags: input.tags,
      priority: input.priority,
      tokenCount: this.tokens.count(input.content),
      hash
    });

    this.repos.usage.record({
      namespace,
      kind: "memory_save",
      rawTokens: memory.tokenCount,
      effectiveTokens: 0,
      metadata: { key: memory.key, priority: memory.priority }
    });

    return {
      memory,
      created: !existing,
      // `duplicate` is only reported when the content already existed under a
      // DIFFERENT key — helps catch unintentional duplication.
      duplicateOf:
        duplicate && duplicate.key !== memory.key ? duplicate : null
    };
  }

  public get(key: string, namespace?: string): Memory {
    const ns = namespace ?? this.config.namespace;
    const memory = this.repos.memory.findByKey(ns, key);
    if (!memory) throw new NotFoundError("Memory", key);
    this.repos.usage.record({
      namespace: ns,
      kind: "memory_load",
      rawTokens: memory.tokenCount,
      effectiveTokens: memory.tokenCount,
      metadata: { key }
    });
    return memory;
  }

  public list(namespace?: string): Memory[] {
    return this.repos.memory.listAll(namespace ?? this.config.namespace);
  }

  public delete(key: string, namespace?: string): void {
    const ns = namespace ?? this.config.namespace;
    const deleted = this.repos.memory.deleteByKeyStrict(ns, key);
    if (!deleted) throw new NotFoundError("Memory", key);
  }

  public clean(options: { archivedOnly: boolean; namespace?: string }): number {
    const ns = options.namespace ?? this.config.namespace;
    return options.archivedOnly
      ? this.repos.memory.cleanArchived(ns)
      : this.repos.memory.purge(ns);
  }

  public search(
    query: string,
    limit: number,
    namespace?: string
  ): Array<SearchResult<Memory>> {
    if (!query.trim()) return [];
    const ns = namespace ?? this.config.namespace;
    const all = this.repos.memory.listAll(ns);
    const scored = all.map((item) => ({
      item,
      score: this.scoreMemory(query, item)
    }));
    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private scoreMemory(query: string, memory: Memory): number {
    const haystack = [
      memory.key,
      memory.content,
      memory.tags.join(" ")
    ].join(" \n ");
    const base = keywordScore(query, haystack);
    const priorityBoost =
      memory.priority === "critical" ? 0.25 : memory.priority === "archive" ? -0.25 : 0;
    return Math.max(0, base + priorityBoost);
  }
}

