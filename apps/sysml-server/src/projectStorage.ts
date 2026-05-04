import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECTS_ROOT = resolve(__dirname, '../data/projects');

/* ------------------------------------------------------------------ */
/*  Project work-dir helpers                                           */
/* ------------------------------------------------------------------ */

export function getProjectsRoot(): string {
  const root = resolve(process.env.SYSML_PROJECTS_ROOT || DEFAULT_PROJECTS_ROOT);
  mkdirSync(root, { recursive: true });
  return root;
}

export function getProjectWorkDir(projectId: string): string {
  return resolve(getProjectsRoot(), projectId);
}

export function ensureProjectWorkDir(projectId: string): string {
  const workDir = getProjectWorkDir(projectId);
  mkdirSync(workDir, { recursive: true });
  return workDir;
}

export function ensureStoredProjectWorkDir(
  projectId: string,
  currentWorkDir?: string | null,
): string {
  const nextWorkDir = currentWorkDir?.trim() || ensureProjectWorkDir(projectId);
  mkdirSync(nextWorkDir, { recursive: true });

  if (!currentWorkDir?.trim()) {
    const now = Date.now();
    getDb()
      .prepare('UPDATE projects SET work_dir = ?, updated_at = ? WHERE id = ?')
      .run(nextWorkDir, now, projectId);
  }

  return nextWorkDir;
}

export function isManagedProjectDir(workDir: string): boolean {
  const root = getProjectsRoot();
  const resolvedDir = resolve(workDir);
  if (resolvedDir === root) return false;
  const rel = relative(root, resolvedDir);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function removeProjectWorkDir(workDir: string): void {
  if (!isManagedProjectDir(workDir)) return;
  rmSync(workDir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ */
/*  Path sanitization                                                  */
/* ------------------------------------------------------------------ */

/**
 * Sanitize a relative file/directory path.
 * Only allows forward-slash paths without leading slash or `..` traversal.
 * Returns null if the path is invalid or empty.
 */
export function sanitizePath(rawPath: string): string | null {
  const normalized = posix.normalize(rawPath.replace(/\\/g, '/'));
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    normalized.startsWith('..') ||
    normalized.includes('/..')
  ) {
    return null;
  }
  return normalized;
}

/* ------------------------------------------------------------------ */
/*  Node ID encoding (path ↔ base64url)                               */
/* ------------------------------------------------------------------ */

/**
 * Encode a relative path to a URL-safe base64url string used as the node ID.
 * IDs change when the path changes (rename/move updates the ID).
 */
export function encodeNodeId(relativePath: string): string {
  return Buffer.from(relativePath).toString('base64url');
}

/**
 * Decode a base64url node ID back to a relative path.
 * Returns null if the ID is malformed or decodes to a dangerous path.
 */
export function decodeNodeId(id: string): string | null {
  try {
    const decoded = Buffer.from(id, 'base64url').toString('utf8');
    return sanitizePath(decoded);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Filesystem node type                                               */
/* ------------------------------------------------------------------ */

export interface FsNode {
  /** base64url-encoded relative path — stable within a path, changes on rename */
  id: string;
  type: 'file' | 'directory';
  /** Relative POSIX path from project root (e.g. "models/main.sysml") */
  path: string;
  /** Entry name (last segment of path) */
  name: string;
  /** File content — only present for files */
  content?: string;
  created_at: number;
  updated_at: number;
}

/* ------------------------------------------------------------------ */
/*  Filesystem scanning                                                */
/* ------------------------------------------------------------------ */

/** Names of entries to skip during scanning (hidden files, IDE artifacts, etc.) */
const SKIP_NAMES = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db']);

function shouldSkip(name: string): boolean {
  return name.startsWith('.') || SKIP_NAMES.has(name);
}

/**
 * Recursively scan a project work directory and return all files and
 * directories (excluding hidden entries and common non-source artifacts).
 *
 * Directories are listed before their contents (depth-first, pre-order).
 */
export function scanProjectDirectory(workDir: string): FsNode[] {
  const result: FsNode[] = [];

  const walk = (dir: string, relativePrefix: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    // Sort: directories before files, then alphabetically
    entries.sort((a, b) => {
      try {
        const aStat = statSync(join(dir, a));
        const bStat = statSync(join(dir, b));
        if (aStat.isDirectory() !== bStat.isDirectory()) {
          return aStat.isDirectory() ? -1 : 1;
        }
      } catch {
        // ignore stat errors
      }
      return a.localeCompare(b);
    });

    for (const entry of entries) {
      if (shouldSkip(entry)) continue;

      const fullPath = join(dir, entry);
      const relPath = relativePrefix ? `${relativePrefix}/${entry}` : entry;

      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        result.push({
          id: encodeNodeId(relPath),
          type: 'directory',
          path: relPath,
          name: entry,
          created_at: stat.birthtimeMs || stat.ctimeMs,
          updated_at: stat.mtimeMs,
        });
        walk(fullPath, relPath);
      } else if (stat.isFile()) {
        let content = '';
        try {
          content = readFileSync(fullPath, 'utf8');
        } catch {
          // unreadable file — include with empty content
        }
        result.push({
          id: encodeNodeId(relPath),
          type: 'file',
          path: relPath,
          name: entry,
          content,
          created_at: stat.birthtimeMs || stat.ctimeMs,
          updated_at: stat.mtimeMs,
        });
      }
    }
  };

  walk(workDir, '');
  return result;
}

/* ------------------------------------------------------------------ */
/*  File / directory operations                                        */
/* ------------------------------------------------------------------ */

export function resolveProjectFilePath(workDir: string, projectPath: string): string {
  const segments = projectPath.split('/').filter(Boolean);
  return resolve(workDir, ...segments);
}

/**
 * Write a file at the given relative project path (creating parent dirs as needed).
 * Returns the absolute path written.
 */
export function writeProjectFile(
  workDir: string,
  projectPath: string,
  content: string,
): string {
  const absolutePath = resolveProjectFilePath(workDir, projectPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, 'utf8');
  return absolutePath;
}

/** Delete a single file at the given relative project path (no-op if missing). */
export function deleteProjectFile(workDir: string, projectPath: string): void {
  const absolutePath = resolveProjectFilePath(workDir, projectPath);
  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath);
  }
}

/** Create a directory at the given relative project path. */
export function ensureProjectSubDirectory(workDir: string, projectPath: string): string {
  const absolutePath = resolveProjectFilePath(workDir, projectPath);
  mkdirSync(absolutePath, { recursive: true });
  return absolutePath;
}

/**
 * Delete a directory (and all its contents) at the given relative project path.
 * No-op if the directory does not exist.
 */
export function deleteProjectDirectory(workDir: string, projectPath: string): void {
  const absolutePath = resolveProjectFilePath(workDir, projectPath);
  if (existsSync(absolutePath)) {
    rmSync(absolutePath, { recursive: true, force: true });
  }
}

/**
 * Check whether the target path already exists on disk (file or directory).
 */
export function projectPathExists(workDir: string, projectPath: string): boolean {
  return existsSync(resolveProjectFilePath(workDir, projectPath));
}