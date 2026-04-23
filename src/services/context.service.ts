import type {
  ContextBundle,
  Memory,
  SearchResult,
  Skill,
  Summary
} from "../types/index.js";
import { contextQueryInputSchema } from "../types/schemas.js";
import type { Repositories } from "../repositories/index.js";
import type { TokenCounter } from "../utils/tokens.js";
import { keywordScore } from "../utils/text.js";
import { recencyScore } from "../utils/time.js";
import { parseOrThrow } from "../utils/validation.js";
import type { ResolvedConfig } from "../config/index.js";

interface Weighted<T> {
  item: T;
  score: number;
  tokens: number;
}

/**
 * Smart context engine.
 *
 * We deliberately stick to deterministic, explainable scoring (keyword +
 * recency + priority) rather than bundling an embeddings model — the goal of
 * TokenSmith is to SAVE tokens, not spend them on a relevance model. The
 * architecture supports swapping in semantic ranking later by implementing a
 * `Ranker` interface (see BONUS notes in README).
 */
export class ContextService {
  public constructor(
    private readonly repos: Repositories,
    private readonly tokens: TokenCounter,
    private readonly config: ResolvedConfig
  ) {}

  public build(input: unknown): ContextBundle {
    const parsed = parseOrThrow(contextQueryInputSchema, input);
    const namespace = parsed.namespace ?? this.config.namespace;
    const tokenBudget = parsed.tokenBudget ?? this.config.context.maxTokens;
    const includeMemories = parsed.includeMemories ?? this.config.context.includeMemories;
    const includeSkills = parsed.includeSkills ?? this.config.context.includeSkills;
    const includeSummaries = parsed.includeSummaries ?? this.config.context.includeSummaries;

    const memoryResults = includeMemories
      ? this.rankMemories(parsed.query, this.repos.memory.listAll(namespace))
      : [];
    const skillResults = includeSkills
      ? this.rankSkills(parsed.query, this.repos.skill.listAll(namespace))
      : [];
    const summaryResults = includeSummaries
      ? this.rankSummaries(parsed.query, this.repos.summary.listAll(namespace))
      : [];

    const selectedMemories = this.fitBudget(memoryResults, Math.floor(tokenBudget * 0.55));
    const selectedSkills = this.fitBudget(skillResults, Math.floor(tokenBudget * 0.2));
    const selectedSummaries = this.fitBudget(summaryResults, Math.floor(tokenBudget * 0.25));

    const renderedText = renderBundle({
      query: parsed.query,
      memories: selectedMemories.map((r) => r.item),
      skills: selectedSkills.map((r) => r.item),
      summaries: selectedSummaries.map((r) => r.item)
    });

    const tokenCount = this.tokens.count(renderedText);
    const bundle: ContextBundle = {
      namespace,
      query: parsed.query,
      tokenBudget,
      memories: selectedMemories.map((r) => r.item),
      skills: selectedSkills.map((r) => r.item),
      summaries: selectedSummaries.map((r) => r.item),
      renderedText,
      tokenCount
    };

    this.repos.usage.record({
      namespace,
      kind: "context_build",
      rawTokens: sumTokens([memoryResults, skillResults, summaryResults]),
      effectiveTokens: tokenCount,
      metadata: {
        memoryCount: bundle.memories.length,
        skillCount: bundle.skills.length,
        summaryCount: bundle.summaries.length,
        tokenBudget
      }
    });

    return bundle;
  }

  public rankMemoriesForQuery(
    namespace: string,
    query: string,
    limit: number
  ): Array<SearchResult<Memory>> {
    return this.rankMemories(query, this.repos.memory.listAll(namespace))
      .slice(0, limit)
      .map((r) => ({ item: r.item, score: r.score }));
  }

  private rankMemories(query: string, items: Memory[]): Array<Weighted<Memory>> {
    const { keywordWeight, recencyWeight, priorityWeight } = this.config.context;
    return items
      .map((item) => {
        const haystack = `${item.key} ${item.content} ${item.tags.join(" ")}`;
        const kw = keywordScore(query, haystack);
        const rec = recencyScore(item.updatedAt);
        const pri = item.priority === "critical" ? 1 : item.priority === "normal" ? 0.5 : 0.1;
        const score =
          kw * keywordWeight + rec * recencyWeight + pri * priorityWeight;
        return { item, score, tokens: item.tokenCount };
      })
      .filter((r) => r.score > 0 || r.item.priority === "critical")
      .sort((a, b) => b.score - a.score);
  }

  private rankSkills(query: string, items: Skill[]): Array<Weighted<Skill>> {
    return items
      .map((item) => {
        const haystack = `${item.name} ${item.description} ${item.tags.join(" ")}`;
        const score = keywordScore(query, haystack);
        return { item, score, tokens: item.tokenCount };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private rankSummaries(
    query: string,
    items: Summary[]
  ): Array<Weighted<Summary>> {
    return items
      .map((item) => {
        const score =
          keywordScore(query, `${item.title} ${item.content}`) * 0.7 +
          recencyScore(item.createdAt) * 0.3;
        return { item, score, tokens: item.compressedTokenCount };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private fitBudget<T>(
    results: Array<Weighted<T>>,
    budget: number
  ): Array<Weighted<T>> {
    if (budget <= 0) return [];
    const picked: Array<Weighted<T>> = [];
    let spent = 0;
    for (const r of results) {
      if (spent + r.tokens > budget) continue;
      picked.push(r);
      spent += r.tokens;
    }
    return picked;
  }
}

function renderBundle(params: {
  query: string;
  memories: Memory[];
  skills: Skill[];
  summaries: Summary[];
}): string {
  const parts: string[] = [];
  parts.push(`# TokenSmith context for: ${params.query}`);

  if (params.memories.length) {
    parts.push("\n## Relevant memories");
    for (const m of params.memories) {
      parts.push(`- (${m.priority}) **${m.key}**${m.tags.length ? ` [${m.tags.join(", ")}]` : ""}:\n${m.content.trim()}`);
    }
  }

  if (params.skills.length) {
    parts.push("\n## Relevant skills");
    for (const s of params.skills) {
      const desc = s.description ? ` — ${s.description}` : "";
      parts.push(`- **${s.name}**${desc}`);
    }
  }

  if (params.summaries.length) {
    parts.push("\n## Previous session summaries");
    for (const s of params.summaries) {
      parts.push(`### ${s.title}\n${s.content.trim()}`);
    }
  }

  if (
    params.memories.length === 0 &&
    params.skills.length === 0 &&
    params.summaries.length === 0
  ) {
    parts.push("\n_No relevant stored context found._");
  }

  return parts.join("\n");
}

function sumTokens(buckets: Array<Array<Weighted<unknown>>>): number {
  let total = 0;
  for (const bucket of buckets) {
    for (const r of bucket) total += r.tokens;
  }
  return total;
}
