import { nanoid } from "nanoid";
import type { DB, Stmt } from "../db/connection.js";
import type { UsageEvent } from "../types/index.js";
import { nowIso } from "../utils/time.js";

interface UsageRecord {
  id: string;
  namespace: string;
  session_id: string | null;
  kind: string;
  raw_tokens: number;
  effective_tokens: number;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface UsageRecordInput {
  namespace: string;
  sessionId?: string | null;
  kind: UsageEvent["kind"];
  rawTokens: number;
  effectiveTokens: number;
  metadata?: Record<string, unknown>;
}

export interface UsageAggregate {
  rawTokens: number;
  effectiveTokens: number;
  eventCount: number;
}

export class UsageRepository {
  private readonly insert: Stmt;
  private readonly aggregateAll: Stmt;
  private readonly aggregateByKind: Stmt;
  private readonly recent: Stmt;
  private readonly perDayStmt: Stmt;

  public constructor(db: DB) {
    this.insert = db.prepare(`
      INSERT INTO usage_events
        (id, namespace, session_id, kind, raw_tokens, effective_tokens, metadata, created_at, updated_at)
      VALUES (@id, @namespace, @session_id, @kind, @raw, @effective, @metadata, @created_at, @updated_at)
    `);
    this.aggregateAll = db.prepare(`
      SELECT COALESCE(SUM(raw_tokens), 0)       as rawTokens,
             COALESCE(SUM(effective_tokens), 0) as effectiveTokens,
             COUNT(*)                            as eventCount
      FROM usage_events
      WHERE namespace = ?
    `);
    this.aggregateByKind = db.prepare(`
      SELECT kind,
             COALESCE(SUM(raw_tokens), 0)       as rawTokens,
             COALESCE(SUM(effective_tokens), 0) as effectiveTokens,
             COUNT(*)                            as eventCount
      FROM usage_events
      WHERE namespace = ?
      GROUP BY kind
      ORDER BY rawTokens DESC
    `);
    this.recent = db.prepare(`
      SELECT * FROM usage_events
      WHERE namespace = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    this.perDayStmt = db.prepare(`
      SELECT substr(created_at, 1, 10) as day,
             COALESCE(SUM(raw_tokens), 0)       as rawTokens,
             COALESCE(SUM(effective_tokens), 0) as effectiveTokens,
             COUNT(*) as eventCount
      FROM usage_events
      WHERE namespace = ?
      GROUP BY day
      ORDER BY day DESC
      LIMIT ?
    `);
  }

  public record(input: UsageRecordInput): UsageEvent {
    const id = nanoid();
    const now = nowIso();
    this.insert.run({
      id,
      namespace: input.namespace,
      session_id: input.sessionId ?? null,
      kind: input.kind,
      raw: input.rawTokens,
      effective: input.effectiveTokens,
      metadata: JSON.stringify(input.metadata ?? {}),
      created_at: now,
      updated_at: now
    });
    return {
      id,
      namespace: input.namespace,
      sessionId: input.sessionId ?? null,
      kind: input.kind,
      rawTokens: input.rawTokens,
      effectiveTokens: input.effectiveTokens,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now
    };
  }

  public totals(namespace: string): UsageAggregate {
    return (
      (this.aggregateAll.get(namespace) as UsageAggregate | undefined) ?? {
        rawTokens: 0,
        effectiveTokens: 0,
        eventCount: 0
      }
    );
  }

  public totalsByKind(
    namespace: string
  ): Array<UsageAggregate & { kind: string }> {
    return this.aggregateByKind.all(namespace) as Array<
      UsageAggregate & { kind: string }
    >;
  }

  public recentEvents(namespace: string, limit: number): UsageEvent[] {
    const rows = this.recent.all(namespace, limit) as UsageRecord[];
    return rows.map((row) => ({
      id: row.id,
      namespace: row.namespace,
      sessionId: row.session_id,
      kind: row.kind as UsageEvent["kind"],
      rawTokens: row.raw_tokens,
      effectiveTokens: row.effective_tokens,
      metadata: safeParseJson(row.metadata),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  public perDay(
    namespace: string,
    limit: number
  ): Array<{ day: string; rawTokens: number; effectiveTokens: number; eventCount: number }> {
    return this.perDayStmt.all(namespace, limit) as Array<{
      day: string;
      rawTokens: number;
      effectiveTokens: number;
      eventCount: number;
    }>;
  }
}

function safeParseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
