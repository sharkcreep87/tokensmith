import { loadConfig, type LoadConfigOptions, type ResolvedConfig } from "./config/index.js";
import { openDatabase, closeDatabase, type DB } from "./db/connection.js";
import { createRepositories, type Repositories } from "./repositories/index.js";
import { createServices, type Services } from "./services/index.js";
import { createTokenCounter, type TokenCounter } from "./utils/tokens.js";
import { createLogger, type Logger } from "./utils/logger.js";

/**
 * Application container — a tiny, explicit DI composition root.
 *
 * We avoid heavyweight DI frameworks (no decorators, no reflect-metadata) to
 * keep the bundle lean and the wiring obvious.
 */
export interface Container {
  readonly config: ResolvedConfig;
  readonly logger: Logger;
  readonly db: DB;
  readonly tokens: TokenCounter;
  readonly repos: Repositories;
  readonly services: Services;
  dispose(): void;
}

export interface CreateContainerOptions extends LoadConfigOptions {
  logger?: Logger;
  tokens?: TokenCounter;
  db?: DB;
}

export function createContainer(options: CreateContainerOptions = {}): Container {
  const config = loadConfig(options);
  const logger =
    options.logger ??
    createLogger({ level: config.logLevel, color: config.color });
  const tokens = options.tokens ?? createTokenCounter(config.tokenModel);
  const db = options.db ?? openDatabase(config.dbPath);
  const repos = createRepositories(db);
  const services = createServices(repos, tokens, config);

  logger.debug("TokenSmith container ready", {
    db: config.dbPath,
    namespace: config.namespace
  });

  let disposed = false;
  return {
    config,
    logger,
    db,
    tokens,
    repos,
    services,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      closeDatabase(db);
    }
  };
}
