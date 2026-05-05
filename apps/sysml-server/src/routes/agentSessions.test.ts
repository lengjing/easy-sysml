import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, initDb } from '../db.js';
import { ensureProjectWorkDir } from '../projectStorage.js';
import { agentSessionsRouter } from './agentSessions.js';

async function startAgentSessionsServer() {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'sysml-agent-sessions-test-'));
  process.env.SYSML_PROJECTS_ROOT = join(tmpRoot, 'projects');
  initDb(join(tmpRoot, 'sysml.db'));

  const db = getDb();
  const projectId = 'project-1';
  const workDir = ensureProjectWorkDir(projectId);
  const now = Date.now();
  db.prepare(
    'INSERT INTO projects (id, name, description, work_dir, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(projectId, 'Project 1', '', workDir, now, now);

  const app = express();
  app.use(express.json());
  app.use('/api/projects/:projectId/sessions', agentSessionsRouter);

  const server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine test server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    projectId,
    workDir,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

describe('agentSessionsRouter', () => {
  const realFetch = globalThis.fetch;
  const realFreeCodeUrl = process.env.FREE_CODE_SERVER_URL;
  const realProjectsRoot = process.env.SYSML_PROJECTS_ROOT;
  let server: Awaited<ReturnType<typeof startAgentSessionsServer>> | undefined;

  beforeEach(async () => {
    process.env.FREE_CODE_SERVER_URL = 'http://fake-free-code';
    server = await startAgentSessionsServer();
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (realFreeCodeUrl === undefined) {
      delete process.env.FREE_CODE_SERVER_URL;
    } else {
      process.env.FREE_CODE_SERVER_URL = realFreeCodeUrl;
    }
    if (realProjectsRoot === undefined) {
      delete process.env.SYSML_PROJECTS_ROOT;
    } else {
      process.env.SYSML_PROJECTS_ROOT = realProjectsRoot;
    }
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it('forwards the resolved project workDir when creating a free-code session', async () => {
    const createdSessionBodies: Array<Record<string, unknown>> = [];

    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url.startsWith('http://fake-free-code/')) {
        createdSessionBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return new Response(JSON.stringify({
          session_id: 'free-code-session-1',
          ws_url: 'ws://fake-free-code/sessions/free-code-session-1/ws',
          work_dir: server!.workDir,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const response = await fetch(`${server!.baseUrl}/api/projects/${server!.projectId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(201);
    const session = await response.json() as {
      free_code_session_id: string | null;
      free_code_ws_url: string | null;
      work_dir: string;
    };

    expect(createdSessionBodies).toHaveLength(1);
    expect(createdSessionBodies[0]).toMatchObject({
      cwd: server!.workDir,
      dangerously_skip_permissions: false,
    });
    expect(session.free_code_session_id).toBe('free-code-session-1');
    expect(session.free_code_ws_url).toBe('ws://fake-free-code/sessions/free-code-session-1/ws');
    expect(session.work_dir).toBe(server!.workDir);
  });
});
