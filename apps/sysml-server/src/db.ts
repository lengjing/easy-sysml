/**
 * SQLite Database Setup
 *
 * Tables:
 *   projects      — SysML project records
 *   sysml_files   — SysML source files linked to projects
 *   sessions      — free-code agent sessions linked to projects
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

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      work_dir    TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sysml_files (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      UNIQUE(project_id, path)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id                   TEXT PRIMARY KEY,
      project_id           TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      free_code_session_id TEXT,
      free_code_ws_url     TEXT,
      work_dir             TEXT NOT NULL DEFAULT '',
      status               TEXT NOT NULL DEFAULT 'active',
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL
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

  const projectColumns = db
    .prepare("PRAGMA table_info(projects)")
    .all() as Array<{ name: string }>;
  if (!projectColumns.some(column => column.name === 'work_dir')) {
    db.exec("ALTER TABLE projects ADD COLUMN work_dir TEXT NOT NULL DEFAULT ''");
  }

  const aiKeyColumns = db
    .prepare("PRAGMA table_info(ai_api_keys)")
    .all() as Array<{ name: string }>;
  if (!aiKeyColumns.some(column => column.name === 'balance_usd')) {
    db.exec('ALTER TABLE ai_api_keys ADD COLUMN balance_usd REAL');
  }
}
