/**
 * Projects Routes
 *
 * CRUD for SysML projects.
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

export const projectsRouter = Router();

/* ------------------------------------------------------------------ */
/*  GET /api/projects                                                  */
/* ------------------------------------------------------------------ */

projectsRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  res.json(rows);
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

  db.prepare(
    'INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, name.trim(), description.trim(), now, now);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:id                                              */
/* ------------------------------------------------------------------ */

projectsRouter.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
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
  res.json(project);
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/projects/:id                                           */
/* ------------------------------------------------------------------ */

projectsRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ ok: true });
});
