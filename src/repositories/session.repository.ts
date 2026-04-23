import { nanoid } from "nanoid";
import type { DB, Stmt } from "../db/connection.js";
import type { SessionMessage } from "../types/index.js";
import { nowIso } from "../utils/time.js";

interface SessionMessageRecord {
  id: string;
  namespace: string;
  session_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  token_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionMessageCreate {
  namespace: string;
  sessionId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tokenCount: number;
}

export class SessionRepository {
  private readonly insert: Stmt;
  private readonly selectBySession: Stmt;
  private readonly deleteBySession: Stmt;
  private readonly listSessions: Stmt;

  public constructor(db: DB) {
    this.insert = db.prepare(`
      INSERT INTO session_messages
        (id, namespace, session_id, role, content, token_count, created_at, updated_at)
      VALUES (@id, @namespace, @session_id, @role, @content, @token_count, @created_at, @updated_at)
    `);
    this.selectBySession = db.prepare(`
      SELECT * FROM session_messages
      WHERE namespace = ? AND session_id = ?
      ORDER BY created_at ASC, rowid ASC
    `);
    this.deleteBySession = db.prepare(
      "DELETE FROM session_messages WHERE namespace = ? AND session_id = ?"
    );
    this.listSessions = db.prepare(`
      SELECT session_id as sessionId,
             SUM(token_count) as tokens,
             COUNT(*) as messages,
             MAX(created_at) as lastActivity
      FROM session_messages
      WHERE namespace = ?
      GROUP BY session_id
      ORDER BY lastActivity DESC
    `);
  }

  public append(input: SessionMessageCreate): SessionMessage {
    const id = nanoid();
    const now = nowIso();
    this.insert.run({
      id,
      namespace: input.namespace,
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      token_count: input.tokenCount,
      created_at: now,
      updated_at: now
    });
    return {
      id,
      namespace: input.namespace,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      tokenCount: input.tokenCount,
      createdAt: now,
      updatedAt: now
    };
  }

  public listForSession(
    namespace: string,
    sessionId: string
  ): SessionMessage[] {
    return (
      this.selectBySession.all(namespace, sessionId) as SessionMessageRecord[]
    ).map((r) => this.toMessage(r));
  }

  public deleteSession(namespace: string, sessionId: string): number {
    return this.deleteBySession.run(namespace, sessionId).changes;
  }

  public summariseSessions(namespace: string): Array<{
    sessionId: string;
    tokens: number;
    messages: number;
    lastActivity: string;
  }> {
    return this.listSessions.all(namespace) as Array<{
      sessionId: string;
      tokens: number;
      messages: number;
      lastActivity: string;
    }>;
  }

  private toMessage(row: SessionMessageRecord): SessionMessage {
    return {
      id: row.id,
      namespace: row.namespace,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      tokenCount: row.token_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
