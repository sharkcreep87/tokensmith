import type { Skill } from "../types/index.js";
import {
  skillAddInputSchema,
  skillRunInputSchema
} from "../types/schemas.js";
import type { Repositories } from "../repositories/index.js";
import type { TokenCounter } from "../utils/tokens.js";
import { renderTemplate } from "../utils/text.js";
import { NotFoundError } from "../utils/errors.js";
import { parseOrThrow } from "../utils/validation.js";
import type { ResolvedConfig } from "../config/index.js";

export interface SkillRunResult {
  skill: Skill;
  rendered: string;
  tokenCount: number;
  missingVariables: string[];
}

export class SkillService {
  public constructor(
    private readonly repos: Repositories,
    private readonly tokens: TokenCounter,
    private readonly config: ResolvedConfig
  ) {}

  public add(input: unknown): Skill {
    const parsed = parseOrThrow(skillAddInputSchema, input);
    return this.repos.skill.upsert({
      namespace: parsed.namespace ?? this.config.namespace,
      name: parsed.name,
      description: parsed.description,
      template: parsed.template,
      tags: parsed.tags,
      tokenCount: this.tokens.count(parsed.template)
    });
  }

  public get(name: string, namespace?: string): Skill {
    const ns = namespace ?? this.config.namespace;
    const skill = this.repos.skill.findByName(ns, name);
    if (!skill) throw new NotFoundError("Skill", name);
    return skill;
  }

  public list(namespace?: string): Skill[] {
    return this.repos.skill.listAll(namespace ?? this.config.namespace);
  }

  public delete(name: string, namespace?: string): void {
    const ns = namespace ?? this.config.namespace;
    const deleted = this.repos.skill.deleteByNameStrict(ns, name);
    if (!deleted) throw new NotFoundError("Skill", name);
  }

  /**
   * Render a skill template with the provided variables. We DO NOT evaluate
   * the template — placeholder substitution only — so users cannot smuggle
   * executable content through `{{…}}` expressions.
   */
  public run(input: unknown): SkillRunResult {
    const parsed = parseOrThrow(skillRunInputSchema, input);
    const ns = parsed.namespace ?? this.config.namespace;
    const skill = this.get(parsed.name, ns);
    const rendered = renderTemplate(skill.template, parsed.variables);
    const tokenCount = this.tokens.count(rendered);

    const missingVariables = Array.from(
      rendered.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)
    ).map((m) => m[1]!);

    this.repos.skill.recordUsage(ns, skill.name);
    this.repos.usage.record({
      namespace: ns,
      kind: "skill_run",
      rawTokens: this.tokens.count(skill.template),
      effectiveTokens: tokenCount,
      metadata: { name: skill.name, variables: Object.keys(parsed.variables) }
    });

    return { skill, rendered, tokenCount, missingVariables };
  }
}
