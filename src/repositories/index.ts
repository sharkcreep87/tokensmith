import type { DB } from "../db/connection.js";
import { MemoryRepository } from "./memory.repository.js";
import { SkillRepository } from "./skill.repository.js";
import { SummaryRepository } from "./summary.repository.js";
import { SessionRepository } from "./session.repository.js";
import { UsageRepository } from "./usage.repository.js";

/**
 * Composite of every repository. Services depend on this interface (not on
 * concrete classes) to stay easy to mock under Vitest.
 */
export interface Repositories {
  memory: MemoryRepository;
  skill: SkillRepository;
  summary: SummaryRepository;
  session: SessionRepository;
  usage: UsageRepository;
}

export function createRepositories(db: DB): Repositories {
  return {
    memory: new MemoryRepository(db),
    skill: new SkillRepository(db),
    summary: new SummaryRepository(db),
    session: new SessionRepository(db),
    usage: new UsageRepository(db)
  };
}

export { MemoryRepository, SkillRepository, SummaryRepository, SessionRepository, UsageRepository };
