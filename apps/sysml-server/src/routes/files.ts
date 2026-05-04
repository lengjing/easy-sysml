/**
 * Files Routes — Filesystem-based SysML file management
 *
 * All files and directories are stored on disk under the project's work_dir.
 * There is NO database table for file content. The file tree is read from
 * the filesystem on demand.
 *
 * Node IDs are base64url-encoded relative paths. They change when a file
 * or directory is renamed or moved — the caller should use the ID returned
 * by PUT/POST to update its local reference.
 *
 * Nested under /api/projects/:projectId/files
 *
 *   GET    /                  — list all files and directories (with content)
 *   POST   /                  — create a file or directory
 *   GET    /:nodeId            — read a single file (with content)
 *   PUT    /:nodeId            — update file content or rename/move a node
 *   DELETE /:nodeId            — delete a file or directory (directories are recursive)
 */

import { Router, type Request, type Response } from 'express';
import { readFileSync, renameSync, statSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { getDb } from '../db.js';
import {
  decodeNodeId,
  deleteProjectDirectory,
  deleteProjectFile,
  encodeNodeId,
  ensureProjectSubDirectory,
  ensureStoredProjectWorkDir,
  projectPathExists,
  sanitizePath,
  scanProjectDirectory,
  writeProjectFile,
} from '../projectStorage.js';

export const filesRouter = Router({ mergeParams: true });

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getProjectWorkDir(projectId: string): string | null {
  const db = getDb();
  const project = db
    .prepare('SELECT id, work_dir FROM projects WHERE id = ?')
    .get(projectId) as { id: string; work_dir?: string } | undefined;
  if (!project) return null;
  return ensureStoredProjectWorkDir(project.id, project.work_dir);
}

function isDirectory(workDir: string, relPath: string): boolean {
  try {
    return statSync(pathResolve(workDir, ...relPath.split('/'))).isDirectory();
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:projectId/files                                 */
/* ------------------------------------------------------------------ */

filesRouter.get('/', (req: Request, res: Response) => {
  const workDir = getProjectWorkDir(req.params.projectId);
  if (!workDir) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const nodes = scanProjectDirectory(workDir);
  res.json(nodes);
});

/* ------------------------------------------------------------------ */
/*  POST /api/projects/:projectId/files                                */
/* ------------------------------------------------------------------ */

filesRouter.post('/', (req: Request, res: Response) => {
  const workDir = getProjectWorkDir(req.params.projectId);
  if (!workDir) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const {
    name,
    path: rawPath,
    content = '',
    type = 'file',
  } = req.body as {
    name?: string;
    path?: string;
    content?: string;
    type?: 'file' | 'directory';
  };

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const resolvedPath = sanitizePath(rawPath?.trim() || name.trim());
  if (!resolvedPath) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  if (projectPathExists(workDir, resolvedPath)) {
    res.status(409).json({ error: 'A file or directory with this path already exists' });
    return;
  }

  try {
    const now = Date.now();
    if (type === 'directory') {
      ensureProjectSubDirectory(workDir, resolvedPath);
      res.status(201).json({
        id: encodeNodeId(resolvedPath),
        type: 'directory',
        path: resolvedPath,
        name: name.trim(),
        created_at: now,
        updated_at: now,
      });
    } else {
      writeProjectFile(workDir, resolvedPath, content);
      res.status(201).json({
        id: encodeNodeId(resolvedPath),
        type: 'file',
        path: resolvedPath,
        name: name.trim(),
        content,
        created_at: now,
        updated_at: now,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create node',
    });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:projectId/files/:nodeId                         */
/* ------------------------------------------------------------------ */

filesRouter.get('/:nodeId', (req: Request, res: Response) => {
  const workDir = getProjectWorkDir(req.params.projectId);
  if (!workDir) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const nodePath = decodeNodeId(req.params.nodeId);
  if (!nodePath) {
    res.status(400).json({ error: 'Invalid node ID' });
    return;
  }

  if (!projectPathExists(workDir, nodePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Read file directly from disk (no full directory scan needed)
  const absPath = pathResolve(workDir, ...nodePath.split('/'));
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(absPath);
  } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const name = nodePath.split('/').pop() ?? nodePath;
  if (stat.isDirectory()) {
    res.json({
      id: encodeNodeId(nodePath),
      type: 'directory',
      path: nodePath,
      name,
      created_at: stat.birthtimeMs || stat.ctimeMs,
      updated_at: stat.mtimeMs,
    });
    return;
  }

  let content = '';
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    // Return empty content for unreadable files
  }

  res.json({
    id: encodeNodeId(nodePath),
    type: 'file',
    path: nodePath,
    name,
    content,
    created_at: stat.birthtimeMs || stat.ctimeMs,
    updated_at: stat.mtimeMs,
  });
});

/* ------------------------------------------------------------------ */
/*  PUT /api/projects/:projectId/files/:nodeId                         */
/* ------------------------------------------------------------------ */

filesRouter.put('/:nodeId', (req: Request, res: Response) => {
  const workDir = getProjectWorkDir(req.params.projectId);
  if (!workDir) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const currentPath = decodeNodeId(req.params.nodeId);
  if (!currentPath) {
    res.status(400).json({ error: 'Invalid node ID' });
    return;
  }

  if (!projectPathExists(workDir, currentPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const {
    name,
    path: rawNewPath,
    content,
  } = req.body as {
    name?: string;
    path?: string;
    content?: string;
  };

  const now = Date.now();

  // Determine the target path from explicit path or derived from name
  let targetPath = currentPath;
  if (rawNewPath !== undefined) {
    const sanitized = sanitizePath(rawNewPath.trim());
    if (!sanitized) {
      res.status(400).json({ error: 'Invalid file path' });
      return;
    }
    targetPath = sanitized;
  } else if (name !== undefined) {
    const segments = currentPath.split('/');
    segments[segments.length - 1] = name.trim();
    const sanitized = sanitizePath(segments.join('/'));
    if (!sanitized) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    targetPath = sanitized;
  }

  if (targetPath !== currentPath && projectPathExists(workDir, targetPath)) {
    res.status(409).json({ error: 'A file or directory with this path already exists' });
    return;
  }

  try {
    const entryName = targetPath.split('/').pop() ?? targetPath;
    const dir = isDirectory(workDir, currentPath);

    if (dir) {
      if (targetPath !== currentPath) {
        renameSync(
          pathResolve(workDir, ...currentPath.split('/')),
          pathResolve(workDir, ...targetPath.split('/')),
        );
      }
      res.json({
        id: encodeNodeId(targetPath),
        type: 'directory',
        path: targetPath,
        name: entryName,
        created_at: now,
        updated_at: now,
      });
    } else {
      let nextContent = content;
      if (nextContent === undefined) {
        try {
          nextContent = readFileSync(pathResolve(workDir, ...currentPath.split('/')), 'utf8');
        } catch {
          nextContent = '';
        }
      }

      writeProjectFile(workDir, targetPath, nextContent);
      if (targetPath !== currentPath) {
        deleteProjectFile(workDir, currentPath);
      }

      res.json({
        id: encodeNodeId(targetPath),
        type: 'file',
        path: targetPath,
        name: entryName,
        content: nextContent,
        created_at: now,
        updated_at: now,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update node',
    });
  }
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/projects/:projectId/files/:nodeId                      */
/* ------------------------------------------------------------------ */

filesRouter.delete('/:nodeId', (req: Request, res: Response) => {
  const workDir = getProjectWorkDir(req.params.projectId);
  if (!workDir) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const nodePath = decodeNodeId(req.params.nodeId);
  if (!nodePath) {
    res.status(400).json({ error: 'Invalid node ID' });
    return;
  }

  if (!projectPathExists(workDir, nodePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  try {
    if (isDirectory(workDir, nodePath)) {
      deleteProjectDirectory(workDir, nodePath);
    } else {
      deleteProjectFile(workDir, nodePath);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete node',
    });
  }
});
