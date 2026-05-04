/**
 * Chat Sessions Routes
 *
 * Manages chat UI sessions with message history.
 * Sessions are stored in the `chat_sessions` table as JSON (no separate
 * messages table — messages are stored inline for simplicity and fast reads).
 *
 * Nested under /api/projects/:projectId/chat-sessions
 *
 *   GET    /                         — list all sessions (without messages)
 *   POST   /                         — create a new session
 *   GET    /:sessionId               — get a session with full message history
 *   PUT    /:sessionId               — update title or conversationId
 *   DELETE /:sessionId               — delete a session
 *   PUT    /:sessionId/messages      — replace all messages in a session
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

export const chatSessionsRouter = Router({ mergeParams: true });

const MAX_SESSIONS_PER_PROJECT = 100;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatSessionRow {
  id: string;
  project_id: string;
  title: string;
  conversation_id: string | null;
  messages_json: string;
  created_at: number;
  updated_at: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseMessages(json: string): unknown[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function projectExists(projectId: string): boolean {
  const db = getDb();
  return Boolean(db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId));
}

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:projectId/chat-sessions                         */
/* ------------------------------------------------------------------ */

chatSessionsRouter.get('/', (req: Request, res: Response) => {
  if (!projectExists(req.params.projectId)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, project_id, title, conversation_id, created_at, updated_at FROM chat_sessions WHERE project_id = ? ORDER BY updated_at DESC',
    )
    .all(req.params.projectId) as Omit<ChatSessionRow, 'messages_json'>[];

  res.json(rows);
});

/* ------------------------------------------------------------------ */
/*  POST /api/projects/:projectId/chat-sessions                        */
/* ------------------------------------------------------------------ */

chatSessionsRouter.post('/', (req: Request, res: Response) => {
  if (!projectExists(req.params.projectId)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { title = '新对话', conversation_id, messages } = req.body as {
    title?: string;
    conversation_id?: string | null;
    messages?: unknown[];
  };

  const db = getDb();

  // Enforce per-project session limit
  const count = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM chat_sessions WHERE project_id = ?')
      .get(req.params.projectId) as { cnt: number }
  ).cnt;
  if (count >= MAX_SESSIONS_PER_PROJECT) {
    // Purge the oldest session
    const oldest = db
      .prepare(
        'SELECT id FROM chat_sessions WHERE project_id = ? ORDER BY updated_at ASC LIMIT 1',
      )
      .get(req.params.projectId) as { id: string } | undefined;
    if (oldest) {
      db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(oldest.id);
    }
  }

  const now = Date.now();
  const id = uuidv4();
  const messagesJson = JSON.stringify(Array.isArray(messages) ? messages : []);

  db.prepare(
    `INSERT INTO chat_sessions (id, project_id, title, conversation_id, messages_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, req.params.projectId, title.trim() || '新对话', conversation_id ?? null, messagesJson, now, now);

  const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as ChatSessionRow;
  res.status(201).json({
    ...row,
    messages: parseMessages(row.messages_json),
    messages_json: undefined,
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/projects/:projectId/chat-sessions/:sessionId              */
/* ------------------------------------------------------------------ */

chatSessionsRouter.get('/:sessionId', (req: Request, res: Response) => {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM chat_sessions WHERE id = ? AND project_id = ?')
    .get(req.params.sessionId, req.params.projectId) as ChatSessionRow | undefined;

  if (!row) {
    res.status(404).json({ error: 'Chat session not found' });
    return;
  }

  res.json({
    ...row,
    messages: parseMessages(row.messages_json),
    messages_json: undefined,
  });
});

/* ------------------------------------------------------------------ */
/*  PUT /api/projects/:projectId/chat-sessions/:sessionId              */
/* ------------------------------------------------------------------ */

chatSessionsRouter.put('/:sessionId', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM chat_sessions WHERE id = ? AND project_id = ?')
    .get(req.params.sessionId, req.params.projectId);

  if (!existing) {
    res.status(404).json({ error: 'Chat session not found' });
    return;
  }

  const { title, conversation_id } = req.body as {
    title?: string;
    conversation_id?: string | null;
  };

  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (title !== undefined) {
    sets.push('title = ?');
    params.push(title.trim() || '新对话');
  }
  if (conversation_id !== undefined) {
    sets.push('conversation_id = ?');
    params.push(conversation_id ?? null);
  }

  params.push(req.params.sessionId, req.params.projectId);
  db.prepare(
    `UPDATE chat_sessions SET ${sets.join(', ')} WHERE id = ? AND project_id = ?`,
  ).run(...params);

  const row = db
    .prepare('SELECT * FROM chat_sessions WHERE id = ?')
    .get(req.params.sessionId) as ChatSessionRow;
  res.json({
    ...row,
    messages: parseMessages(row.messages_json),
    messages_json: undefined,
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/projects/:projectId/chat-sessions/:sessionId           */
/* ------------------------------------------------------------------ */

chatSessionsRouter.delete('/:sessionId', (req: Request, res: Response) => {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM chat_sessions WHERE id = ? AND project_id = ?')
    .run(req.params.sessionId, req.params.projectId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Chat session not found' });
    return;
  }

  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/*  PUT /api/projects/:projectId/chat-sessions/:sessionId/messages     */
/* ------------------------------------------------------------------ */

chatSessionsRouter.put('/:sessionId/messages', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM chat_sessions WHERE id = ? AND project_id = ?')
    .get(req.params.sessionId, req.params.projectId);

  if (!existing) {
    res.status(404).json({ error: 'Chat session not found' });
    return;
  }

  const { messages } = req.body as { messages?: unknown[] };
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: 'messages must be an array' });
    return;
  }

  const now = Date.now();
  const messagesJson = JSON.stringify(messages);

  db.prepare(
    'UPDATE chat_sessions SET messages_json = ?, updated_at = ? WHERE id = ? AND project_id = ?',
  ).run(messagesJson, now, req.params.sessionId, req.params.projectId);

  res.json({ ok: true, count: messages.length });
});
