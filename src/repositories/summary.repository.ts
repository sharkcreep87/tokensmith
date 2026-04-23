import { nanoid } from "nanoid";
import type { DB, Stmt } from "../db/connection.js";
import type { Summary } from "../types/index.js";
import { nowIso } from "../utils/time.js";

interface SummaryRecord {
  id: string;
  namespace: string;
  session_id: string;
  scope: "session" | "project";
  title: string;
  content: string;
  original_token_count: number;
  compressed_token_count: number;
  created_at: string;
  updated_at: string;
}

export interface SummaryCreate {
  namespace: string;
  sessionId: string;
  scope: "session" | "project";
  title: string;
  content: string;
  originalTokenCount: number;
  compressedTokenCount: number;
}

export class SummaryRepository {
  private readonly insert: Stmt;
  private readonly selectAll: Stmt;
  private readonly selectBySession: Stmt;
  private readonly deleteBySession: Stmt;

  public constructor(db: DB) {
    this.insert = db.prepare(`
      INSERT INTO summaries
        (id, namespace, session_id, scope, title, content, original_token_count, compressed_token_count, created_at, updated_at)
      VALUES (@id, @namespace, @session_id, @scope, @title, @content, @original, @compressed, @created_at, @updated_at)
    `);
    this.selectAll = db.prepare(
      "SELECT * FROM summaries WHERE namespace = ? ORDER BY created_at DESC"
    );
    this.selectBySession = db.prepare(
      "SELECT * FROM summaries WHERE namespace = ? AND session_id = ? ORDER BY created_at DESC"
    );
    this.deleteBySession = db.prepare(
      "DELETE FROM summaries WHERE namespace = ? AND session_id = ?"
    );
  }

  public create(input: SummaryCreate): Summary {
    const id = nanoid();
    const now = nowIso();
    this.insert.run({
      id,
      namespace: input.namespace,
      session_id: input.sessionId,
      scope: input.scope,
      title: input.title,
      content: input.content,
      original: input.originalTokenCount,
      compressed: input.compressedTokenCount,
      created_at: now,
      updated_at: now
    });
    return {
      id,
      namespace: input.namespace,
      sessionId: input.sessionId,
      scope: input.scope,
      title: input.title,
      content: input.content,
      originalTokenCount: input.originalTokenCount,
      compressedTokenCount: input.compressedTokenCount,
      createdAt: now,
      updatedAt: now
    };
  }

  public listAll(namespace: string): Summary[] {
    return (this.selectAll.all(namespace) as SummaryRecord[]).map((r) =>
      this.toSummary(r)
    );
  }

  public listForSession(namespace: string, sessionId: string): Summary[] {
    return (
      this.selectBySession.all(namespace, sessionId) as SummaryRecord[]
    ).map((r) => this.toSummary(r));
  }

  public deleteSession(namespace: string, sessionId: string): number {
    return this.deleteBySession.run(namespace, sessionId).changes;
  }

  private toSummary(row: SummaryRecord): Summary {
    return {
      id: row.id,
      namespace: row.namespace,
      sessionId: row.session_id,
      scope: row.scope,
      title: row.title,
      content: row.content,
      originalTokenCount: row.original_token_count,
      compressedTokenCount: row.compressed_token_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
