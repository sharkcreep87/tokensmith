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
 * This module has TWO responsibilities that both directly affect Claude's
 * output quality:
 *
 *  1. Pick relevant memories/skills/summaries within a strict token budget.
 *  2. Render them in a form that minimises the risk of hallucination:
 *     - a grounding preamble that tells Claude how to treat the injection,
 *     - per-item provenance (key, tags, priority, updated date) so Claude
 *       can cite instead of invent,
 *     - verbatim preservation of `critical` memories (never truncated),
 *     - a minimum confidence threshold — we would rather inject nothing
 *       than inject weakly-related context that could pull Claude off-topic.
 *
 * Ranking stays deterministic (keyword + recency + priority). That is the
 * right trade-off for an anti-hallucination tool: the plumbing must be
 * explainable and reproducible, not another black box.
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
    const includeMemories =
      parsed.includeMemories ?? this.config.context.includeMemories;
    const includeSkills =
      parsed.includeSkills ?? this.config.context.includeSkills;
    const includeSummaries =
      parsed.includeSummaries ?? this.config.context.includeSummaries;

    if (this.config.grounding.mode === "off") {
      return this.emptyBundle(namespace, parsed.query, tokenBudget);
    }

    const memoryResults = includeMemories
      ? this.rankMemories(parsed.query, this.repos.memory.listAll(namespace))
      : [];
    const skillResults = includeSkills
      ? this.rankSkills(parsed.query, this.repos.skill.listAll(namespace))
      : [];
    const summaryResults = includeSummaries
      ? this.rankSummaries(parsed.query, this.repos.summary.listAll(namespace))
      : [];

    // Apply the confidence floor. Critical memories are never filtered out —
    // by definition the user wants them available even without keyword match.
    const minScore = this.config.context.minInjectionScore;
    const memoryPool = memoryResults.filter(
      (r) => r.score >= minScore || r.item.priority === "critical"
    );
    const skillPool = skillResults.filter((r) => r.score >= minScore);
    const summaryPool = summaryResults.filter((r) => r.score >= minScore);

    const selectedMemories = this.fitBudget(
      memoryPool,
      Math.floor(tokenBudget * 0.55)
    );
    const selectedSkills = this.fitBudget(
      skillPool,
      Math.floor(tokenBudget * 0.2)
    );
    const selectedSummaries = this.fitBudget(
      summaryPool,
      Math.floor(tokenBudget * 0.25)
    );

    const renderedText = this.renderBundle({
      query: parsed.query,
      memories: selectedMemories,
      skills: selectedSkills,
      summaries: selectedSummaries
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
        tokenBudget,
        minScore,
        groundingMode: this.config.grounding.mode
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

  private rankMemories(
    query: string,
    items: Memory[]
  ): Array<Weighted<Memory>> {
    const { keywordWeight, recencyWeight, priorityWeight } = this.config.context;
    return items
      .map((item) => {
        const haystack = `${item.key} ${item.content} ${item.tags.join(" ")}`;
        const kw = keywordScore(query, haystack);
        const rec = recencyScore(item.updatedAt);
        const pri =
          item.priority === "critical"
            ? 1
            : item.priority === "normal"
              ? 0.5
              : 0.1;

        // Anti-hallucination guardrail: a non-critical memory must have at
        // least SOME keyword overlap with the query to be considered
        // relevant. Recency and priority alone are not enough — otherwise
        // we'd inject any-recent-memory into any-query, which is exactly
        // how "confidently wrong" context ends up in the prompt.
        if (item.priority !== "critical" && kw === 0) {
          return { item, score: 0, tokens: item.tokenCount };
        }

        const score =
          kw * keywordWeight + rec * recencyWeight + pri * priorityWeight;
        return { item, score, tokens: item.tokenCount };
      })
      .sort((a, b) => b.score - a.score);
  }

  private rankSkills(query: string, items: Skill[]): Array<Weighted<Skill>> {
    return items
      .map((item) => {
        const haystack = `${item.name} ${item.description} ${item.tags.join(" ")}`;
        const score = keywordScore(query, haystack);
        return { item, score, tokens: item.tokenCount };
      })
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

  private emptyBundle(
    namespace: string,
    query: string,
    tokenBudget: number
  ): ContextBundle {
    return {
      namespace,
      query,
      tokenBudget,
      memories: [],
      skills: [],
      summaries: [],
      renderedText: "",
      tokenCount: 0
    };
  }

  private renderBundle(params: {
    query: string;
    memories: Array<Weighted<Memory>>;
    skills: Array<Weighted<Skill>>;
    summaries: Array<Weighted<Summary>>;
  }): string {
    const { grounding } = this.config;
    const nothingMatched =
      params.memories.length === 0 &&
      params.skills.length === 0 &&
      params.summaries.length === 0;

    // If strict grounding is on and nothing scored above the threshold we
    // inject an empty string. Silence is the anti-hallucination default.
    if (nothingMatched && grounding.mode === "strict") return "";

    const parts: string[] = [];

    if (grounding.includeHeader) {
      parts.push(GROUNDING_HEADER(params.query, grounding.mode));
    } else {
      parts.push(`# TokenSmith context for: ${params.query}`);
    }

    if (params.memories.length) {
      parts.push("\n## Project memories (sourced from TokenSmith store)");
      for (const { item, score } of params.memories) {
        parts.push(this.renderMemory(item, score));
      }
    }

    if (params.skills.length) {
      parts.push("\n## Available skills");
      for (const { item } of params.skills) {
        const desc = item.description ? ` — ${item.description}` : "";
        parts.push(`- **${item.name}**${desc} _(id: skill:${item.id})_`);
      }
    }

    if (params.summaries.length) {
      parts.push("\n## Prior-session summaries (may be abridged)");
      for (const { item } of params.summaries) {
        parts.push(
          `### ${item.title} _(id: summary:${item.id}, ${item.createdAt})_`
        );
        parts.push(
          "> ⚠️ This is a compressed summary. Verify facts against the user " +
            "or source before relying on them."
        );
        parts.push(item.content.trim());
      }
    }

    if (nothingMatched) {
      parts.push(
        "\n_No relevant stored context met the confidence threshold — do not infer additional context from TokenSmith._"
      );
    }

    return parts.join("\n");
  }

  private renderMemory(memory: Memory, score: number): string {
    const cite = this.config.grounding.citeSources
      ? ` _(id: memory:${memory.id}, priority=${memory.priority}, score=${score.toFixed(2)}, updated=${memory.updatedAt})_`
      : "";
    const tagLine = memory.tags.length ? ` [${memory.tags.join(", ")}]` : "";

    // Critical memories are injected verbatim — no truncation, no
    // reformatting — so Claude can never paraphrase them into something
    // subtly wrong.
    const verbatim =
      this.config.grounding.verbatimCritical && memory.priority === "critical";
    const body = verbatim
      ? `\`\`\`\n${memory.content}\n\`\`\``
      : memory.content.trim();

    return `- **${memory.key}**${tagLine}${cite}:\n${body}`;
  }
}

/**
 * System-message preamble injected with every non-empty bundle. These
 * instructions are the primary anti-hallucination lever: they tell Claude
 * how much authority to grant the injected context and when to push back.
 */
const GROUNDING_HEADER = (query: string, mode: "strict" | "normal" | "off"): string => `
# TokenSmith grounded context (mode: ${mode})

The following context was retrieved from the TokenSmith store for the query:
**${query}**

Treat this block as supplementary reference material. Follow these rules:

1. **Cite, don't invent.** If you quote from this block, reference it by its
   bracketed id (e.g. \`memory:abc123\`). If no item answers the user's
   question, say so plainly — do NOT fabricate details.
2. **Prefer newer information.** If the live conversation or the current
   filesystem contradicts a stored memory, trust the live information and
   ask the user to confirm before updating the memory.
3. **Never escalate uncertainty.** Items are labelled \`priority=archive\`
   when they may be stale. Lower your confidence accordingly.
4. **Verbatim is verbatim.** Items rendered inside fenced code blocks are
   stored verbatim. Do not paraphrase or summarise them when quoting.
5. **Summaries are lossy.** Sections marked "summary" are compressed and may
   omit details. Verify critical facts with the user before acting.

If this block is empty, do not mention TokenSmith to the user — simply answer
from the live context and the user's request.
`.trim();

function sumTokens(buckets: Array<Array<Weighted<unknown>>>): number {
  let total = 0;
  for (const bucket of buckets) {
    for (const r of bucket) total += r.tokens;
  }
  return total;
}
