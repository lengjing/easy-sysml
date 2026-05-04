/**
 * SysML Server — Main Entry Point
 *
 * Express server providing:
 *   - Project management (CRUD)
 *   - SysML file management (filesystem-based, no DB)
 *   - Agent session management (linked to free-code server sessions)
 *   - Chat session management (stored in DB with message history)
 *   - Chat/streaming endpoint (SSE, proxies to free-code agent)
 *
 * API:
 *   GET    /api/projects
 *   POST   /api/projects
 *   GET    /api/projects/:id
 *   PUT    /api/projects/:id
 *   DELETE /api/projects/:id
 *
 *   GET    /api/projects/:projectId/files
 *   POST   /api/projects/:projectId/files
 *   GET    /api/projects/:projectId/files/:nodeId
 *   PUT    /api/projects/:projectId/files/:nodeId
 *   DELETE /api/projects/:projectId/files/:nodeId
 *
 *   GET    /api/projects/:projectId/sessions
 *   POST   /api/projects/:projectId/sessions
 *   GET    /api/projects/:projectId/sessions/:sessionId
 *   DELETE /api/projects/:projectId/sessions/:sessionId
 *
 *   GET    /api/projects/:projectId/chat-sessions
 *   POST   /api/projects/:projectId/chat-sessions
 *   GET    /api/projects/:projectId/chat-sessions/:sessionId
 *   PUT    /api/projects/:projectId/chat-sessions/:sessionId
 *   DELETE /api/projects/:projectId/chat-sessions/:sessionId
 *   PUT    /api/projects/:projectId/chat-sessions/:sessionId/messages
 *
 *   POST   /api/sessions/:sessionId/chat   (SSE stream)
 *   POST   /api/chat                       (SSE stream, direct)
 *
 *   GET    /api/status
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';
import { projectsRouter } from './routes/projects.js';
import { filesRouter } from './routes/files.js';
import { agentSessionsRouter } from './routes/agentSessions.js';
import { chatSessionsRouter } from './routes/chatSessions.js';
import { chatRouter } from './routes/chat.js';
import { directChatRouter } from './routes/directChat.js';
import { adminAuthRouter } from './routes/adminAuth.js';
import { aiKeysRouter } from './routes/aiKeys.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Database                                                          */
/* ------------------------------------------------------------------ */

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '../data/sysml.db');

initDb(dbPath);
console.log(`[sysml-server] Database: ${dbPath}`);

/* ------------------------------------------------------------------ */
/*  Express app                                                       */
/* ------------------------------------------------------------------ */

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/files', filesRouter);
app.use('/api/projects/:projectId/sessions', agentSessionsRouter);
app.use('/api/projects/:projectId/chat-sessions', chatSessionsRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/ai/keys', aiKeysRouter);
app.use('/api/sessions/:sessionId/chat', chatRouter);
app.use('/api/chat', directChatRouter);

/* ------------------------------------------------------------------ */
/*  GET /api/status                                                   */
/* ------------------------------------------------------------------ */

app.get('/api/status', (_req, res) => {
  const freeCodeUrl = process.env.FREE_CODE_SERVER_URL || 'http://localhost:3002';
  res.json({
    ok: true,
    server: 'sysml-server',
    version: '0.2.0',
    configured: true,
    providerLabel: 'free-code',
    free_code_server_url: freeCodeUrl,
    ai_api_key_required: true,
    admin_auth_required: true,
  });
});

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`[sysml-server] Running on http://localhost:${PORT}`);
  console.log(`[sysml-server] free-code server: ${process.env.FREE_CODE_SERVER_URL || 'http://localhost:3002'}`);
  console.log(`[sysml-server] Database: ${dbPath}`);
});
