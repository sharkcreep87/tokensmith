import { nanoid } from "nanoid";
import type { DB, Stmt } from "../db/connection.js";
import type { Skill } from "../types/index.js";
import { nowIso } from "../utils/time.js";

interface SkillRecord {
  id: string;
  namespace: string;
  name: string;
  description: string;
  template: string;
  tags: string;
  token_count: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface SkillUpsert {
  namespace: string;
  name: string;
  description: string;
  template: string;
  tags: string[];
  tokenCount: number;
}

export class SkillRepository {
  private readonly insert: Stmt;
  private readonly update: Stmt;
  private readonly selectByName: Stmt;
  private readonly selectAll: Stmt;
  private readonly deleteByName: Stmt;
  private readonly incrementUsage: Stmt;

  public constructor(private readonly db: DB) {
    this.insert = db.prepare(`
      INSERT INTO skills
        (id, namespace, name, description, template, tags, token_count, usage_count, created_at, updated_at)
      VALUES (@id, @namespace, @name, @description, @template, @tags, @token_count, 0, @created_at, @updated_at)
    `);
    this.update = db.prepare(`
      UPDATE skills
         SET description = @description,
             template = @template,
             tags = @tags,
             token_count = @token_count,
             updated_at = @updated_at
       WHERE namespace = @namespace AND name = @name
    `);
    this.selectByName = db.prepare(
      "SELECT * FROM skills WHERE namespace = ? AND name = ?"
    );
    this.selectAll = db.prepare(
      "SELECT * FROM skills WHERE namespace = ? ORDER BY name ASC"
    );
    this.deleteByName = db.prepare(
      "DELETE FROM skills WHERE namespace = ? AND name = ?"
    );
    this.incrementUsage = db.prepare(
      "UPDATE skills SET usage_count = usage_count + 1, updated_at = ? WHERE namespace = ? AND name = ?"
    );
  }

  public upsert(input: SkillUpsert): Skill {
    const existing = this.selectByName.get(input.namespace, input.name) as
      | SkillRecord
      | undefined;
    const now = nowIso();
    if (existing) {
      this.update.run({
        namespace: input.namespace,
        name: input.name,
        description: input.description,
        template: input.template,
        tags: JSON.stringify(input.tags),
        token_count: input.tokenCount,
        updated_at: now
      });
      return this.toSkill({
        ...existing,
        description: input.description,
        template: input.template,
        tags: JSON.stringify(input.tags),
        token_count: input.tokenCount,
        updated_at: now
      });
    }

    const id = nanoid();
    this.insert.run({
      id,
      namespace: input.namespace,
      name: input.name,
      description: input.description,
      template: input.template,
      tags: JSON.stringify(input.tags),
      token_count: input.tokenCount,
      created_at: now,
      updated_at: now
    });
    return this.toSkill({
      id,
      namespace: input.namespace,
      name: input.name,
      description: input.description,
      template: input.template,
      tags: JSON.stringify(input.tags),
      token_count: input.tokenCount,
      usage_count: 0,
      created_at: now,
      updated_at: now
    });
  }

  public findByName(namespace: string, name: string): Skill | null {
    const row = this.selectByName.get(namespace, name) as
      | SkillRecord
      | undefined;
    return row ? this.toSkill(row) : null;
  }

  public listAll(namespace: string): Skill[] {
    const rows = this.selectAll.all(namespace) as SkillRecord[];
    return rows.map((r) => this.toSkill(r));
  }

  public deleteByNameStrict(namespace: string, name: string): boolean {
    const info = this.deleteByName.run(namespace, name);
    return info.changes > 0;
  }

  public recordUsage(namespace: string, name: string): void {
    this.incrementUsage.run(nowIso(), namespace, name);
  }

  private toSkill(row: SkillRecord): Skill {
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(row.tags);
      if (Array.isArray(parsed)) {
        tags = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      tags = [];
    }
    return {
      id: row.id,
      namespace: row.namespace,
      name: row.name,
      description: row.description,
      template: row.template,
      tags,
      tokenCount: row.token_count,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
