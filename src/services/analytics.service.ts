import type { TokenSavings, UsageEvent } from "../types/index.js";
import type { Repositories } from "../repositories/index.js";
import type { ResolvedConfig } from "../config/index.js";

export interface AnalyticsStats {
  namespace: string;
  totalRaw: number;
  totalEffective: number;
  savings: TokenSavings;
  eventCount: number;
  byKind: Array<{
    kind: string;
    rawTokens: number;
    effectiveTokens: number;
    eventCount: number;
    savings: TokenSavings;
  }>;
  perDay: Array<{
    day: string;
    rawTokens: number;
    effectiveTokens: number;
    eventCount: number;
  }>;
  sessionCount: number;
}

export class AnalyticsService {
  public constructor(
    private readonly repos: Repositories,
    private readonly config: ResolvedConfig
  ) {}

  public stats(namespace?: string): AnalyticsStats {
    const ns = namespace ?? this.config.namespace;
    const totals = this.repos.usage.totals(ns);
    const byKind = this.repos.usage.totalsByKind(ns).map((row) => ({
      ...row,
      savings: computeSavings(row.rawTokens, row.effectiveTokens)
    }));
    const perDay = this.repos.usage.perDay(ns, 14);
    const sessions = this.repos.session.summariseSessions(ns);

    return {
      namespace: ns,
      totalRaw: totals.rawTokens,
      totalEffective: totals.effectiveTokens,
      savings: computeSavings(totals.rawTokens, totals.effectiveTokens),
      eventCount: totals.eventCount,
      byKind,
      perDay,
      sessionCount: sessions.length
    };
  }

  public recent(namespace?: string, limit = 20): UsageEvent[] {
    return this.repos.usage.recentEvents(namespace ?? this.config.namespace, limit);
  }
}

export function computeSavings(
  rawTokens: number,
  effectiveTokens: number
): TokenSavings {
  const saved = Math.max(0, rawTokens - effectiveTokens);
  const reductionPct = rawTokens > 0 ? saved / rawTokens : 0;
  return {
    raw: rawTokens,
    effective: effectiveTokens,
    saved,
    reductionPct
  };
}
