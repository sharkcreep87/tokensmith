/**
 * SQLite schema bootstrap. We keep it inline rather than shelling out to
 * migration tooling so the package stays single-binary-friendly.
 *
 * Every table scopes rows by `namespace` so that different projects can share
 * a database if desired (the default is a per-project DB, auto-detected from
 * the git root).
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS schema_meta (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  version   INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id           TEXT PRIMARY KEY,
  namespace    TEXT NOT NULL,
  key          TEXT NOT NULL,
  content      TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  priority     TEXT NOT NULL CHECK (priority IN ('critical','normal','archive')),
  token_count  INTEGER NOT NULL DEFAULT 0,
  hash         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE(namespace, key)
);
CREATE INDEX IF NOT EXISTS idx_memories_ns      ON memories(namespace);
CREATE INDEX IF NOT EXISTS idx_memories_prio    ON memories(namespace, priority);
CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(namespace, updated_at);
CREATE INDEX IF NOT EXISTS idx_memories_hash    ON memories(namespace, hash);

CREATE TABLE IF NOT EXISTS skills (
  id           TEXT PRIMARY KEY,
  namespace    TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  template     TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  token_count  INTEGER NOT NULL DEFAULT 0,
  usage_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE(namespace, name)
);
CREATE INDEX IF NOT EXISTS idx_skills_ns    ON skills(namespace);
CREATE INDEX IF NOT EXISTS idx_skills_usage ON skills(namespace, usage_count);

CREATE TABLE IF NOT EXISTS summaries (
  id                      TEXT PRIMARY KEY,
  namespace               TEXT NOT NULL,
  session_id              TEXT NOT NULL,
  scope                   TEXT NOT NULL CHECK (scope IN ('session','project')),
  title                   TEXT NOT NULL,
  content                 TEXT NOT NULL,
  original_token_count    INTEGER NOT NULL,
  compressed_token_count  INTEGER NOT NULL,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_summaries_ns       ON summaries(namespace);
CREATE INDEX IF NOT EXISTS idx_summaries_session  ON summaries(namespace, session_id);
CREATE INDEX IF NOT EXISTS idx_summaries_created  ON summaries(namespace, created_at);

CREATE TABLE IF NOT EXISTS session_messages (
  id           TEXT PRIMARY KEY,
  namespace    TEXT NOT NULL,
  session_id   TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content      TEXT NOT NULL,
  token_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sm_session ON session_messages(namespace, session_id, created_at);

CREATE TABLE IF NOT EXISTS usage_events (
  id                TEXT PRIMARY KEY,
  namespace         TEXT NOT NULL,
  session_id        TEXT,
  kind              TEXT NOT NULL,
  raw_tokens        INTEGER NOT NULL DEFAULT 0,
  effective_tokens  INTEGER NOT NULL DEFAULT 0,
  metadata          TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_ns       ON usage_events(namespace);
CREATE INDEX IF NOT EXISTS idx_usage_session  ON usage_events(namespace, session_id);
CREATE INDEX IF NOT EXISTS idx_usage_kind     ON usage_events(namespace, kind);
CREATE INDEX IF NOT EXISTS idx_usage_created  ON usage_events(namespace, created_at);
`;
