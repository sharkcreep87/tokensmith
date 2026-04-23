import type { Repositories } from "../repositories/index.js";
import type { TokenCounter } from "../utils/tokens.js";
import type { ResolvedConfig } from "../config/index.js";
import { MemoryService } from "./memory.service.js";
import { SkillService } from "./skill.service.js";
import { ContextService } from "./context.service.js";
import { CompressionService } from "./compression.service.js";
import { AnalyticsService } from "./analytics.service.js";
import { SessionService } from "./session.service.js";
import { ExportService } from "./export.service.js";

/**
 * Composite of every domain service. Constructed once per CLI invocation in
 * `createContainer()`.
 */
export interface Services {
  memory: MemoryService;
  skill: SkillService;
  context: ContextService;
  compression: CompressionService;
  analytics: AnalyticsService;
  session: SessionService;
  export: ExportService;
}

export function createServices(
  repos: Repositories,
  tokens: TokenCounter,
  config: ResolvedConfig
): Services {
  return {
    memory: new MemoryService(repos, tokens, config),
    skill: new SkillService(repos, tokens, config),
    context: new ContextService(repos, tokens, config),
    compression: new CompressionService(repos, tokens, config),
    analytics: new AnalyticsService(repos, config),
    session: new SessionService(repos, tokens, config),
    export: new ExportService(repos, tokens, config)
  };
}

export {
  MemoryService,
  SkillService,
  ContextService,
  CompressionService,
  AnalyticsService,
  SessionService,
  ExportService
};
