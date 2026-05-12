/**
 * SysML Server 鈥?Main Entry Point
 *
 * Express server providing:
 *   - Project management (CRUD)
 *   - SysML file management (filesystem-based, no DB)
 *   - Project-scoped conversations and transcript persistence
 *   - Conversation runs streamed through Claude server
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
 *   GET    /api/projects/:projectId/conversations
 *   POST   /api/projects/:projectId/conversations
 *   GET    /api/projects/:projectId/conversations/:conversationId
 *   PATCH  /api/projects/:projectId/conversations/:conversationId
 *   DELETE /api/projects/:projectId/conversations/:conversationId
 *   GET    /api/projects/:projectId/conversations/:conversationId/messages
 *   POST   /api/projects/:projectId/conversations/:conversationId/messages
 *   GET    /api/projects/:projectId/conversations/:conversationId/runs
 *   POST   /api/projects/:projectId/conversations/:conversationId/runs
 *   GET    /api/projects/:projectId/conversations/:conversationId/runs/:runId
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
import { conversationsRouter } from './routes/conversations.js';
import { conversationRunsRouter } from './routes/conversationRuns.js';
import { adminAuthRouter } from './routes/adminAuth.js';
import { aiKeysRouter } from './routes/aiKeys.js';
import { shutdownManagedProjectServers } from './projectServerManager.js';

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
app.use('/api/projects/:projectId/conversations', conversationsRouter);
app.use('/api/projects/:projectId/conversations/:conversationId/runs', conversationRunsRouter);
app.use('/api/admin', adminAuthRouter);
app.use('/api/ai/keys', aiKeysRouter);

/* ------------------------------------------------------------------ */
/*  GET /api/status                                                   */
/* ------------------------------------------------------------------ */

app.get('/api/status', (_req, res) => {
  const agentServerUrl = process.env.AGENT_SERVER_URL || 'http://localhost:3002';
  const managedProjectServers = process.env.SYSML_MANAGE_FORK_SERVERS !== '0';
  res.json({
    ok: true,
    server: 'sysml-server',
    version: '0.2.0',
    configured: true,
    providerLabel: 'claude',
    agent_server_url: agentServerUrl,
    ai_api_key_required: true,
    admin_auth_required: true,
    managed_project_servers: managedProjectServers,
    conversation_delete_supported: true,
  });
});

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const PORT = parseInt(process.env.PORT || '3001', 10);
const server = app.listen(PORT, () => {
  console.log(`[sysml-server] Running on http://localhost:${PORT}`);
  console.log(`[sysml-server] agent server: ${process.env.AGENT_SERVER_URL || 'http://localhost:3002'}`);
  console.log(`[sysml-server] Database: ${dbPath}`);
});

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[sysml-server] Received ${signal}, shutting down...`);

  try {
    await shutdownManagedProjectServers();
  } catch (error) {
    console.warn('[sysml-server] Failed during managed server shutdown:', error);
  }

  await new Promise<void>(resolve => {
    server.close(() => resolve());
  });

  process.exit(0);
}

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
