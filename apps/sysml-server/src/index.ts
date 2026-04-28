/**
 * SysML Server — Main Entry Point
 *
 * Express server providing:
 *   - Project management (CRUD)
 *   - SysML file management (CRUD, linked to projects)
 *   - Session management (linked to free-code server sessions)
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
 *   GET    /api/projects/:projectId/files/:fileId
 *   PUT    /api/projects/:projectId/files/:fileId
 *   DELETE /api/projects/:projectId/files/:fileId
 *
 *   GET    /api/projects/:projectId/sessions
 *   POST   /api/projects/:projectId/sessions
 *   GET    /api/projects/:projectId/sessions/:sessionId
 *   DELETE /api/projects/:projectId/sessions/:sessionId
 *
 *   POST   /api/sessions/:sessionId/chat   (SSE stream)
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
import { sessionsRouter } from './routes/sessions.js';
import { chatRouter } from './routes/chat.js';
import { directChatRouter } from './routes/directChat.js';

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
app.use('/api/projects/:projectId/sessions', sessionsRouter);
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
    version: '0.1.0',
    // configured is always true — free-code reachability is checked at chat time
    configured: true,
    providerLabel: 'free-code',
    free_code_server_url: freeCodeUrl,
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
