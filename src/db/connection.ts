import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { DatabaseError } from "../utils/errors.js";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";
import { nowIso } from "../utils/time.js";

export type DB = Database.Database;

/**
 * Permissive statement type used by repositories. The bind-parameters tuple
 * is left open so each prepared statement can take any positional or named
 * arguments without re-declaring a narrower generic at every call site.
 */
export type Stmt = BetterSqlite3.Statement<unknown[]>;

/**
 * Open (and lazily bootstrap) the SQLite database.
 *
 * - Uses WAL so long-running CLI sessions don't block Claude Code hook writes.
 * - Creates the containing directory if missing.
 * - Idempotently applies the schema and stamps the current version.
 */
export function openDatabase(dbPath: string): DB {
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    // Performance pragmas: WAL keeps writes off the main reader lock so the
    // CLI and the Claude Code plugin hook can run concurrently. NORMAL
    // synchronisation is safe with WAL and ~2x faster than FULL. Memory-backed
    // temp store and a larger page cache keep hot queries under a few ms on
    // the sub-megabyte DBs TokenSmith typically produces.
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    db.pragma("temp_store = MEMORY");
    db.pragma("cache_size = -20000"); // ~20 MB page cache
    db.pragma("mmap_size = 67108864"); // 64 MB memory-mapped I/O
    db.exec(SCHEMA_SQL);

    const row = db
      .prepare("SELECT version FROM schema_meta WHERE id = 1")
      .get() as { version: number } | undefined;

    if (!row) {
      db.prepare(
        "INSERT INTO schema_meta (id, version, created_at) VALUES (1, ?, ?)"
      ).run(SCHEMA_VERSION, nowIso());
    } else if (row.version > SCHEMA_VERSION) {
      throw new DatabaseError(
        `Database schema v${row.version} is newer than supported v${SCHEMA_VERSION}. Upgrade tokensmith.`
      );
    }
    return db;
  } catch (err) {
    if (err instanceof DatabaseError) throw err;
    throw new DatabaseError(
      `Failed to open database at ${dbPath}: ${(err as Error).message}`,
      err
    );
  }
}

export function closeDatabase(db: DB): void {
  try {
    db.close();
  } catch {
    // best-effort — nothing actionable on close failures
  }
}
