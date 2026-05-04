/**
 * SQLite Database Setup
 *
 * Tables:
 *   projects        — SysML project records
 *   agent_sessions  — free-code agent sessions linked to projects
 *   chat_sessions   — chat UI sessions with message history (JSON)
 *   ai_api_keys     — API key management with usage tracking
 *
 * Note: SysML source files are stored on the filesystem (project work_dir),
 * NOT in the database. The files route reads/writes them directly from disk.
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

  // ── Legacy migrations ──────────────────────────────────────────────────
  // Rename `sessions` → `agent_sessions` (clearer naming)
  if (tables.has('sessions') && !tables.has('agent_sessions')) {
    db.exec('ALTER TABLE sessions RENAME TO agent_sessions');
  }

  // Drop old sysml_files table — files are now on the filesystem
  if (tables.has('sysml_files')) {
    db.exec('DROP TABLE sysml_files');
  }

  // ── Core schema ────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      work_dir    TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id                   TEXT PRIMARY KEY,
      project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      free_code_session_id TEXT,
      free_code_ws_url     TEXT,
      work_dir             TEXT NOT NULL DEFAULT '',
      status               TEXT NOT NULL DEFAULT 'active',
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title           TEXT NOT NULL DEFAULT '新对话',
      conversation_id TEXT,
      messages_json   TEXT NOT NULL DEFAULT '[]',
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
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
  `);

  // ── Column-level migrations ────────────────────────────────────────────
  const projectCols = getColumnNames(db, 'projects');
  if (!projectCols.has('work_dir')) {
    db.exec("ALTER TABLE projects ADD COLUMN work_dir TEXT NOT NULL DEFAULT ''");
  }

  const aiKeyCols = getColumnNames(db, 'ai_api_keys');
  if (!aiKeyCols.has('balance_usd')) {
    db.exec('ALTER TABLE ai_api_keys ADD COLUMN balance_usd REAL');
  }
}
