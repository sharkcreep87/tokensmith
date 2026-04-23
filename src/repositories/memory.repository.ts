import { nanoid } from "nanoid";
import type { DB, Stmt } from "../db/connection.js";
import type { Memory, Priority } from "../types/index.js";
import { nowIso } from "../utils/time.js";

/**
 * Persistence layer for memories. All callers MUST go through this repository
 * rather than issuing SQL directly, so the tag/JSON marshalling stays in a
 * single spot and namespace scoping is enforced.
 */
export interface MemoryRecord {
  id: string;
  namespace: string;
  key: string;
  content: string;
  tags: string;
  priority: Priority;
  token_count: number;
  hash: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryUpsert {
  namespace: string;
  key: string;
  content: string;
  tags: string[];
  priority: Priority;
  tokenCount: number;
  hash: string;
}

export class MemoryRepository {
  private readonly insert: Stmt;
  private readonly update: Stmt;
  private readonly selectByKey: Stmt;
  private readonly selectByHash: Stmt;
  private readonly selectAll: Stmt;
  private readonly deleteByKey: Stmt;
  private readonly deleteArchived: Stmt;
  private readonly deleteAll: Stmt;

  public constructor(private readonly db: DB) {
    this.insert = db.prepare(`
      INSERT INTO memories
        (id, namespace, key, content, tags, priority, token_count, hash, created_at, updated_at)
      VALUES (@id, @namespace, @key, @content, @tags, @priority, @token_count, @hash, @created_at, @updated_at)
    `);
    this.update = db.prepare(`
      UPDATE memories
         SET content = @content,
             tags = @tags,
             priority = @priority,
             token_count = @token_count,
             hash = @hash,
             updated_at = @updated_at
       WHERE namespace = @namespace AND key = @key
    `);
    this.selectByKey = db.prepare(
      "SELECT * FROM memories WHERE namespace = ? AND key = ?"
    );
    this.selectByHash = db.prepare(
      "SELECT * FROM memories WHERE namespace = ? AND hash = ? LIMIT 1"
    );
    this.selectAll = db.prepare(
      "SELECT * FROM memories WHERE namespace = ? ORDER BY updated_at DESC"
    );
    this.deleteByKey = db.prepare(
      "DELETE FROM memories WHERE namespace = ? AND key = ?"
    );
    this.deleteArchived = db.prepare(
      "DELETE FROM memories WHERE namespace = ? AND priority = 'archive'"
    );
    this.deleteAll = db.prepare(
      "DELETE FROM memories WHERE namespace = ?"
    );
  }

  public upsert(input: MemoryUpsert): Memory {
    const existing = this.selectByKey.get(input.namespace, input.key) as
      | MemoryRecord
      | undefined;
    const now = nowIso();
    if (existing) {
      this.update.run({
        namespace: input.namespace,
        key: input.key,
        content: input.content,
        tags: JSON.stringify(input.tags),
        priority: input.priority,
        token_count: input.tokenCount,
        hash: input.hash,
        updated_at: now
      });
      return this.toMemory({
        ...existing,
        content: input.content,
        tags: JSON.stringify(input.tags),
        priority: input.priority,
        token_count: input.tokenCount,
        hash: input.hash,
        updated_at: now
      });
    }

    const id = nanoid();
    this.insert.run({
      id,
      namespace: input.namespace,
      key: input.key,
      content: input.content,
      tags: JSON.stringify(input.tags),
      priority: input.priority,
      token_count: input.tokenCount,
      hash: input.hash,
      created_at: now,
      updated_at: now
    });
    return this.toMemory({
      id,
      namespace: input.namespace,
      key: input.key,
      content: input.content,
      tags: JSON.stringify(input.tags),
      priority: input.priority,
      token_count: input.tokenCount,
      hash: input.hash,
      created_at: now,
      updated_at: now
    });
  }

  public findByKey(namespace: string, key: string): Memory | null {
    const row = this.selectByKey.get(namespace, key) as
      | MemoryRecord
      | undefined;
    return row ? this.toMemory(row) : null;
  }

  public findByHash(namespace: string, hash: string): Memory | null {
    const row = this.selectByHash.get(namespace, hash) as
      | MemoryRecord
      | undefined;
    return row ? this.toMemory(row) : null;
  }

  public listAll(namespace: string): Memory[] {
    const rows = this.selectAll.all(namespace) as MemoryRecord[];
    return rows.map((r) => this.toMemory(r));
  }

  public deleteByKeyStrict(namespace: string, key: string): boolean {
    const info = this.deleteByKey.run(namespace, key);
    return info.changes > 0;
  }

  public cleanArchived(namespace: string): number {
    return this.deleteArchived.run(namespace).changes;
  }

  public purge(namespace: string): number {
    return this.deleteAll.run(namespace).changes;
  }

  private toMemory(row: MemoryRecord): Memory {
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
      key: row.key,
      content: row.content,
      tags,
      priority: row.priority,
      tokenCount: row.token_count,
      hash: row.hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
