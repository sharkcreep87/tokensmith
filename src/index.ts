/**
 * Public programmatic API. Import this from Node.js code or Claude Code hooks.
 *
 *   import { createContainer } from "tokensmith";
 *   const app = createContainer();
 *   app.services.memory.save({ key: "api-base", content: "..." });
 */
export { createContainer, type Container, type CreateContainerOptions } from "./container.js";
export { loadConfig, type ResolvedConfig, type LoadConfigOptions } from "./config/index.js";
export * from "./types/index.js";
export * from "./types/schemas.js";
export {
  MemoryService,
  SkillService,
  ContextService,
  CompressionService,
  AnalyticsService,
  SessionService,
  ExportService,
  type Services
} from "./services/index.js";
export {
  TokenSmithError,
  ConfigError,
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError
} from "./utils/errors.js";
export { createTokenCounter, GptTokenCounter, type TokenCounter } from "./utils/tokens.js";
export { computeSavings } from "./services/analytics.service.js";
