import fs from "node:fs";
import path from "node:path";
import type { Memory, Skill, Summary } from "../types/index.js";
import type { Repositories } from "../repositories/index.js";
import type { TokenCounter } from "../utils/tokens.js";
import { contentHash } from "../utils/hash.js";
import { ConfigError } from "../utils/errors.js";
import type { ResolvedConfig } from "../config/index.js";

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  namespace: string;
  memories: Memory[];
  skills: Skill[];
  summaries: Summary[];
}

export interface ImportResult {
  importedMemories: number;
  importedSkills: number;
  importedSummaries: number;
  skippedDuplicates: number;
}

export class ExportService {
  public constructor(
    private readonly repos: Repositories,
    private readonly tokens: TokenCounter,
    private readonly config: ResolvedConfig
  ) {}

  public export(namespace?: string): ExportBundle {
    const ns = namespace ?? this.config.namespace;
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      namespace: ns,
      memories: this.repos.memory.listAll(ns),
      skills: this.repos.skill.listAll(ns),
      summaries: this.repos.summary.listAll(ns)
    };
  }

  public exportToFile(targetPath: string, namespace?: string): string {
    const bundle = this.export(namespace);
    const abs = path.resolve(targetPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(bundle, null, 2), "utf8");
    return abs;
  }

  public importFromFile(
    sourcePath: string,
    options: { namespace?: string; overwrite?: boolean } = {}
  ): ImportResult {
    const abs = path.resolve(sourcePath);
    if (!fs.existsSync(abs)) {
      throw new ConfigError(`Import file not found: ${abs}`);
    }
    const raw = fs.readFileSync(abs, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as ExportBundle).version !== 1
    ) {
      throw new ConfigError("Unsupported export bundle format");
    }
    const bundle = parsed as ExportBundle;
    const ns = options.namespace ?? this.config.namespace ?? bundle.namespace;
    const overwrite = options.overwrite ?? false;

    let importedMemories = 0;
    let importedSkills = 0;
    let importedSummaries = 0;
    let skippedDuplicates = 0;

    for (const m of bundle.memories) {
      const existing = this.repos.memory.findByKey(ns, m.key);
      if (existing && !overwrite) {
        skippedDuplicates += 1;
        continue;
      }
      this.repos.memory.upsert({
        namespace: ns,
        key: m.key,
        content: m.content,
        tags: m.tags,
        priority: m.priority,
        tokenCount: this.tokens.count(m.content),
        hash: contentHash(m.content)
      });
      importedMemories += 1;
    }

    for (const s of bundle.skills) {
      const existing = this.repos.skill.findByName(ns, s.name);
      if (existing && !overwrite) {
        skippedDuplicates += 1;
        continue;
      }
      this.repos.skill.upsert({
        namespace: ns,
        name: s.name,
        description: s.description,
        template: s.template,
        tags: s.tags,
        tokenCount: this.tokens.count(s.template)
      });
      importedSkills += 1;
    }

    for (const s of bundle.summaries) {
      this.repos.summary.create({
        namespace: ns,
        sessionId: s.sessionId,
        scope: s.scope,
        title: s.title,
        content: s.content,
        originalTokenCount: s.originalTokenCount,
        compressedTokenCount: s.compressedTokenCount
      });
      importedSummaries += 1;
    }

    return {
      importedMemories,
      importedSkills,
      importedSummaries,
      skippedDuplicates
    };
  }
}
