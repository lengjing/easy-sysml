/**
 * SysML Files Routes
 *
 * CRUD for SysML source files linked to projects.
 * Nested under /api/projects/:projectId/files
 */

import { Router, type Request, type Response } from 'express';
import { posix } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

export const filesRouter = Router({ mergeParams: true });

/* ------------------------------------------------------------------ */
/*  Path sanitization                                                  */
/* ------------------------------------------------------------------ */

/**
 * Sanitize a file path to prevent directory traversal.
 * Only allows relative paths without leading / or .. sequences.
 * Returns null if the path is invalid.
 */
function sanitizeFilePath(rawPath: string): string | null {
  // Normalize using POSIX rules (forward slashes only in stored paths)
  const normalized = posix.normalize(rawPath.replace(/\\/g, '/'));

  // Reject absolute paths or any traversal that escapes the virtual root
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('..') ||
    normalized.includes('/..')
  ) {
    return null;
  }

  return normalized;
}

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:projectId/files                                 */
/* ------------------------------------------------------------------ */

filesRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const files = db
    .prepare('SELECT * FROM sysml_files WHERE project_id = ? ORDER BY path ASC')
    .all(req.params.projectId);
  res.json(files);
});

/* ------------------------------------------------------------------ */
/*  POST /api/projects/:projectId/files                                */
/* ------------------------------------------------------------------ */

filesRouter.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { name, path: filePath, content = '' } = req.body as {
    name?: string;
    path?: string;
    content?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  // Default path to name if not provided, then sanitize
  const rawPath = filePath?.trim() || name.trim();
  const resolvedPath = sanitizeFilePath(rawPath);
  if (!resolvedPath) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  // Check for duplicate path within project
  const duplicate = db
    .prepare('SELECT id FROM sysml_files WHERE project_id = ? AND path = ?')
    .get(req.params.projectId, resolvedPath);
  if (duplicate) {
    res.status(409).json({ error: 'A file with this path already exists in the project' });
    return;
  }

  const now = Date.now();
  const id = uuidv4();

  db.prepare(
    'INSERT INTO sysml_files (id, project_id, name, path, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, req.params.projectId, name.trim(), resolvedPath, content, now, now);

  const file = db.prepare('SELECT * FROM sysml_files WHERE id = ?').get(id);
  res.status(201).json(file);
});

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:projectId/files/:fileId                         */
/* ------------------------------------------------------------------ */

filesRouter.get('/:fileId', (req: Request, res: Response) => {
  const db = getDb();
  const file = db
    .prepare('SELECT * FROM sysml_files WHERE id = ? AND project_id = ?')
    .get(req.params.fileId, req.params.projectId);
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.json(file);
});

/* ------------------------------------------------------------------ */
/*  PUT /api/projects/:projectId/files/:fileId                         */
/* ------------------------------------------------------------------ */

filesRouter.put('/:fileId', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT id, path FROM sysml_files WHERE id = ? AND project_id = ?')
    .get(req.params.fileId, req.params.projectId) as { id: string; path: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const { name, path: filePath, content } = req.body as {
    name?: string;
    path?: string;
    content?: string;
  };
  const now = Date.now();

  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (name !== undefined) {
    if (!name.trim()) {
      res.status(400).json({ error: 'name cannot be empty' });
      return;
    }
    sets.push('name = ?');
    params.push(name.trim());
  }
  if (content !== undefined) {
    sets.push('content = ?');
    params.push(content);
  }
  if (filePath !== undefined) {
    const resolvedPath = sanitizeFilePath(filePath.trim());
    if (!resolvedPath) {
      res.status(400).json({ error: 'Invalid file path' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM sysml_files WHERE project_id = ? AND path = ? AND id != ?')
      .get(req.params.projectId, resolvedPath, req.params.fileId);
    if (duplicate) {
      res.status(409).json({ error: 'A file with this path already exists in the project' });
      return;
    }

    if (resolvedPath !== existing.path) {
      sets.push('path = ?');
      params.push(resolvedPath);
    }
  }

  params.push(req.params.fileId, req.params.projectId);
  db.prepare(
    `UPDATE sysml_files SET ${sets.join(', ')} WHERE id = ? AND project_id = ?`,
  ).run(...params);

  const file = db.prepare('SELECT * FROM sysml_files WHERE id = ?').get(req.params.fileId);
  res.json(file);
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/projects/:projectId/files/:fileId                      */
/* ------------------------------------------------------------------ */

filesRouter.delete('/:fileId', (req: Request, res: Response) => {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM sysml_files WHERE id = ? AND project_id = ?')
    .run(req.params.fileId, req.params.projectId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.json({ ok: true });
});
