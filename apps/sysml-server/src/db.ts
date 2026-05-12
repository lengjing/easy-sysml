/**
 * SQLite Database Setup
 *
 * Tables:
 *   projects               — SysML project records
 *   conversations          — User-visible chat containers within a project
 *   conversation_messages  — Durable transcript rows for each conversation
 *   conversation_runs      — Execution records for assistant turns
 *   ai_api_keys            — API key management with usage tracking
 *
 * Claude upstream sessions remain an execution detail, but the product-facing
 * conversation model is stored locally. SysML source files stay on the
 * filesystem.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

export function initDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function getTableNames(db: Database.Database): Set<string> {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;
  return new Set(rows.map(r => r.name));
}

function getColumnNames(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map(r => r.name));
}

function migrate(db: Database.Database): void {
  const tables = getTableNames(db);

  for (const table of ['sessions', 'agent_sessions', 'chat_sessions', 'sysml_files']) {
    if (tables.has(table)) {
      db.exec(`DROP TABLE ${table}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      work_dir    TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id                  TEXT PRIMARY KEY,
      project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title               TEXT NOT NULL DEFAULT '新对话',
      status              TEXT NOT NULL DEFAULT 'active',
      upstream_session_id TEXT,
      last_message_at     INTEGER,
      archived_at         INTEGER,
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      run_id          TEXT REFERENCES conversation_runs(id) ON DELETE SET NULL,
      role            TEXT NOT NULL,
      content_json    TEXT NOT NULL,
      tool_calls_json TEXT NOT NULL DEFAULT '[]',
      thinking_json   TEXT NOT NULL DEFAULT '[]',
      sequence        INTEGER NOT NULL,
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_runs (
      id                   TEXT PRIMARY KEY,
      conversation_id      TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      status               TEXT NOT NULL,
      trigger_message_id   TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
      assistant_message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
      model                TEXT,
      usage_json           TEXT NOT NULL DEFAULT '{}',
      error_text           TEXT,
      started_at           INTEGER,
      completed_at         INTEGER,
      created_at           INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_api_keys (
      id                                 TEXT PRIMARY KEY,
      name                               TEXT NOT NULL,
      key_prefix                         TEXT NOT NULL,
      key_hash                           TEXT NOT NULL UNIQUE,
      created_at                         INTEGER NOT NULL,
      updated_at                         INTEGER NOT NULL,
      last_used_at                       INTEGER,
      revoked_at                         INTEGER,
      total_requests                     INTEGER NOT NULL DEFAULT 0,
      total_input_tokens                 INTEGER NOT NULL DEFAULT 0,
      total_output_tokens                INTEGER NOT NULL DEFAULT 0,
      total_cache_creation_input_tokens  INTEGER NOT NULL DEFAULT 0,
      total_cache_read_input_tokens      INTEGER NOT NULL DEFAULT 0,
      total_cost_usd                     REAL NOT NULL DEFAULT 0,
      balance_usd                        REAL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_project_updated
      ON conversations(project_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_conversations_project_status
      ON conversations(project_id, status);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_sequence
      ON conversation_messages(conversation_id, sequence);

    CREATE INDEX IF NOT EXISTS idx_conversation_runs_conversation_created
      ON conversation_runs(conversation_id, created_at DESC);
  `);

  const projectCols = getColumnNames(db, 'projects');
  if (!projectCols.has('work_dir')) {
    db.exec("ALTER TABLE projects ADD COLUMN work_dir TEXT NOT NULL DEFAULT ''");
  }

  const aiKeyCols = getColumnNames(db, 'ai_api_keys');
  if (!aiKeyCols.has('balance_usd')) {
    db.exec('ALTER TABLE ai_api_keys ADD COLUMN balance_usd REAL');
  }
}
