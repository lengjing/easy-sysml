/**
 * Sessions Routes
 *
 * Manages free-code agent sessions linked to projects.
 * Nested under /api/projects/:projectId/sessions
 *
 * Each session corresponds to a free-code server session.
 * When a session is created, a new session is also created on the free-code server.
 */

import { Router, type Request, type Response } from 'express';
import { resolve, isAbsolute } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

export const sessionsRouter = Router({ mergeParams: true });

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getFreeCodeServerUrl(): string {
  return process.env.FREE_CODE_SERVER_URL || 'http://localhost:3002';
}

function getFreeCodeAuthToken(): string | undefined {
  return process.env.FREE_CODE_AUTH_TOKEN;
}

function freeCodeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getFreeCodeAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Resolve and validate a working directory path.
 * Ensures the path is absolute and does not escape allowed boundaries.
 * Falls back to the configured default when cwd is not provided or invalid.
 */
function resolveWorkDir(cwd: string | undefined): string {
  const defaultDir = process.env.FREE_CODE_WORK_DIR || process.cwd();

  if (!cwd) return defaultDir;

  // Resolve to an absolute path
  const resolved = isAbsolute(cwd) ? resolve(cwd) : resolve(defaultDir, cwd);

  // Reject paths containing traversal sequences after resolution if they
  // escape the default workspace root.
  const workspaceRoot = resolve(defaultDir);
  if (!resolved.startsWith(workspaceRoot + '/') && resolved !== workspaceRoot) {
    console.warn(`[sysml-server] Rejected cwd outside workspace: ${resolved}`);
    return defaultDir;
  }

  return resolved;
}

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:projectId/sessions                              */
/* ------------------------------------------------------------------ */

sessionsRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const sessions = db
    .prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC')
    .all(req.params.projectId);
  res.json(sessions);
});

/* ------------------------------------------------------------------ */
/*  POST /api/projects/:projectId/sessions                             */
/* ------------------------------------------------------------------ */

sessionsRouter.post('/', async (req: Request, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId) as
    | { id: string; name: string }
    | undefined;
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const {
    model,
    system_prompt: systemPrompt,
    max_turns: maxTurns,
    allowed_tools: allowedTools,
    dangerously_skip_permissions: dangerouslySkipPermissions = false,
    cwd,
  } = req.body as {
    model?: string;
    system_prompt?: string;
    max_turns?: number;
    allowed_tools?: string[];
    dangerously_skip_permissions?: boolean;
    cwd?: string;
  };

  // Create session on the free-code server
  const freeCodeUrl = getFreeCodeServerUrl();
  let freeCodeSessionId: string | undefined;
  let freeCodeWsUrl: string | undefined;
  let workDir = resolveWorkDir(cwd);

  try {
    const body: Record<string, unknown> = {
      dangerously_skip_permissions: dangerouslySkipPermissions,
    };
    if (model) body.model = model;
    if (systemPrompt) body.system_prompt = systemPrompt;
    if (maxTurns !== undefined) body.max_turns = maxTurns;
    if (allowedTools) body.allowed_tools = allowedTools;
    if (cwd) body.cwd = cwd;

    const resp = await fetch(`${freeCodeUrl}/sessions`, {
      method: 'POST',
      headers: freeCodeHeaders(),
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = (await resp.json()) as {
        session_id?: string;
        ws_url?: string;
        work_dir?: string;
      };
      freeCodeSessionId = data.session_id;
      freeCodeWsUrl = data.ws_url;
      if (data.work_dir) workDir = data.work_dir;
    } else {
      const errText = await resp.text();
      console.warn(`[sysml-server] free-code server returned ${resp.status}: ${errText}`);
    }
  } catch (err) {
    console.warn(`[sysml-server] Could not reach free-code server at ${freeCodeUrl}:`, err);
  }

  // Store session in DB regardless (even if free-code is unavailable)
  const now = Date.now();
  const id = uuidv4();

  db.prepare(
    `INSERT INTO sessions (id, project_id, free_code_session_id, free_code_ws_url, work_dir, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(id, req.params.projectId, freeCodeSessionId ?? null, freeCodeWsUrl ?? null, workDir, now, now);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  res.status(201).json(session);
});

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:projectId/sessions/:sessionId                   */
/* ------------------------------------------------------------------ */

sessionsRouter.get('/:sessionId', (req: Request, res: Response) => {
  const db = getDb();
  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND project_id = ?')
    .get(req.params.sessionId, req.params.projectId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/projects/:projectId/sessions/:sessionId                */
/* ------------------------------------------------------------------ */

sessionsRouter.delete('/:sessionId', async (req: Request, res: Response) => {
  const db = getDb();
  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND project_id = ?')
    .get(req.params.sessionId, req.params.projectId) as
    | { id: string; free_code_session_id: string | null }
    | undefined;
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Try to stop the free-code session
  if (session.free_code_session_id) {
    const freeCodeUrl = getFreeCodeServerUrl();
    try {
      await fetch(`${freeCodeUrl}/sessions/${session.free_code_session_id}`, {
        method: 'DELETE',
        headers: freeCodeHeaders(),
      });
    } catch (err) {
      console.warn('[sysml-server] Could not delete free-code session:', err);
    }
  }

  db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(
    'closed',
    Date.now(),
    session.id,
  );

  res.json({ ok: true });
});
