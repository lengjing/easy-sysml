/**
 * Projects Routes
 *
 * CRUD for SysML projects.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { ensureProjectWorkDir, ensureStoredProjectWorkDir, removeProjectWorkDir } from '../projectStorage.js';

export const projectsRouter = Router();

/* ------------------------------------------------------------------ */
/*  Git initialisation helper                                          */
/* ------------------------------------------------------------------ */

/**
 * Initialise a git repository in `workDir` and create an empty initial
 * commit so the project directory has a full commit history from creation.
 * Failures are logged but not propagated — git is a best-effort feature.
 */
function initGitRepo(workDir: string, projectName: string): void {
  const run = (args: string[]) =>
    spawnSync('git', args, { cwd: workDir, stdio: 'pipe' });

  const init = run(['init']);
  if (init.error) {
    // git binary not found or cannot be executed
    console.warn(
      '[sysml-server] git not available — skipping repo init:',
      (init.error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'git command not found'
        : init.error.message,
    );
    return;
  }
  if (init.status !== 0) {
    console.warn('[sysml-server] git init failed:', init.stderr?.toString());
    return;
  }

  // Create a .gitkeep so the initial commit is non-empty
  writeFileSync(join(workDir, '.gitkeep'), '');

  // Configure a minimal identity for the commit if none is set globally.
  // Log a warning if config fails but continue — a pre-configured global identity is fine.
  const emailResult = run(['config', 'user.email', 'sysml-server@local']);
  if (emailResult.status !== 0) {
    console.warn('[sysml-server] git config user.email failed:', emailResult.stderr?.toString());
  }
  const nameResult = run(['config', 'user.name', 'SysML Server']);
  if (nameResult.status !== 0) {
    console.warn('[sysml-server] git config user.name failed:', nameResult.stderr?.toString());
  }

  run(['add', '.gitkeep']);
  const commit = run(['commit', '-m', `Initial commit for project: ${projectName}`]);
  if (commit.status !== 0) {
    console.warn('[sysml-server] git commit failed:', commit.stderr?.toString());
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/projects                                                  */
/* ------------------------------------------------------------------ */

projectsRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Array<{
    id: string;
    work_dir?: string;
  }>;
  const hydratedRows = rows.map(row => ({
    ...row,
    work_dir: ensureStoredProjectWorkDir(row.id, row.work_dir),
  }));
  res.json(hydratedRows);
});

/* ------------------------------------------------------------------ */
/*  POST /api/projects                                                 */
/* ------------------------------------------------------------------ */

projectsRouter.post('/', (req: Request, res: Response) => {
  const { name, description = '' } = req.body as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const db = getDb();
  const now = Date.now();
  const id = uuidv4();
  const workDir = ensureProjectWorkDir(id);

  // Initialise a git repository so the project has full commit history
  initGitRepo(workDir, name.trim());

  db.prepare(
    'INSERT INTO projects (id, name, description, work_dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, name.trim(), description.trim(), workDir, now, now);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:id                                              */
/* ------------------------------------------------------------------ */

projectsRouter.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as
    | ({ id: string; work_dir?: string } & Record<string, unknown>)
    | undefined;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({
    ...project,
    work_dir: ensureStoredProjectWorkDir(project.id, project.work_dir),
  });
});

/* ------------------------------------------------------------------ */
/*  PUT /api/projects/:id                                              */
/* ------------------------------------------------------------------ */

projectsRouter.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { name, description } = req.body as { name?: string; description?: string };
  const now = Date.now();

  if (name !== undefined && !name.trim()) {
    res.status(400).json({ error: 'name cannot be empty' });
    return;
  }

  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (name !== undefined) {
    sets.push('name = ?');
    params.push(name.trim());
  }
  if (description !== undefined) {
    sets.push('description = ?');
    params.push(description.trim());
  }

  params.push(req.params.id);
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const hydratedProject = project as { id: string; work_dir?: string } & Record<string, unknown>;
  res.json({
    ...hydratedProject,
    work_dir: ensureStoredProjectWorkDir(hydratedProject.id, hydratedProject.work_dir),
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/projects/:id                                           */
/* ------------------------------------------------------------------ */

projectsRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT id, work_dir FROM projects WHERE id = ?').get(req.params.id) as
    | { id: string; work_dir?: string }
    | undefined;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (result.changes > 0) {
    removeProjectWorkDir(ensureStoredProjectWorkDir(project.id, project.work_dir));
  }
  res.json({ ok: true });
});
