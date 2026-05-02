/**
 * Sessions Route Tests
 *
 * Tests for /api/projects/:projectId/sessions endpoints:
 *   GET    /api/projects/:projectId/sessions
 *   POST   /api/projects/:projectId/sessions
 *   GET    /api/projects/:projectId/sessions/:sessionId
 *   DELETE /api/projects/:projectId/sessions/:sessionId
 */

import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb, getDb } from '../db.js';
import { projectsRouter } from './projects.js';
import { sessionsRouter } from './sessions.js';

/* ------------------------------------------------------------------ */
/*  Test server helper                                                 */
/* ------------------------------------------------------------------ */

async function startTestServer(freeCodeServerUrl?: string) {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'sysml-sessions-test-'));
  initDb(join(tmpRoot, 'sysml.db'));

  if (freeCodeServerUrl !== undefined) {
    process.env.FREE_CODE_SERVER_URL = freeCodeServerUrl;
  } else {
    // Point at an unreachable port so fetch() rejects immediately
    process.env.FREE_CODE_SERVER_URL = 'http://127.0.0.1:1';
  }

  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects/:projectId/sessions', sessionsRouter);

  const server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine test server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  /** Creates a project and returns its id */
  const createProject = async (name = 'Test Project'): Promise<string> => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const project = (await res.json()) as { id: string };
    return project.id;
  };

  return {
    baseUrl,
    createProject,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      }),
  };
}

/* ------------------------------------------------------------------ */
/*  Mock free-code server helper                                       */
/* ------------------------------------------------------------------ */

/** Starts a minimal HTTP server that mimics the free-code server API. */
async function startMockFreeCodeServer(opts: {
  respondWith?: { session_id: string; ws_url: string; work_dir?: string };
  statusCode?: number;
}) {
  const { createServer: createHttpServer } = await import('node:http');

  const mockServer = createHttpServer((req, res) => {
    if (req.method === 'POST' && req.url === '/sessions') {
      if (opts.statusCode && opts.statusCode !== 201) {
        res.writeHead(opts.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'mock error' }));
        return;
      }
      const body = opts.respondWith ?? {
        session_id: 'mock-session-id',
        ws_url: 'ws://localhost:9999/sessions/mock-session-id',
        work_dir: '/tmp/mock-work-dir',
      };
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === 'DELETE' && req.url?.startsWith('/sessions/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise<void>(resolve => {
    mockServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = mockServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not get mock server address');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        mockServer.close(err => (err ? reject(err) : resolve()));
      }),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('sessions routes', () => {
  let server: Awaited<ReturnType<typeof startTestServer>> | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
    delete process.env.FREE_CODE_SERVER_URL;
  });

  /* ---------------------------------------------------------------- */
  /*  GET /api/projects/:projectId/sessions                           */
  /* ---------------------------------------------------------------- */

  describe('GET /api/projects/:projectId/sessions', () => {
    it('returns 404 when project does not exist', async () => {
      server = await startTestServer();
      const res = await fetch(
        `${server.baseUrl}/api/projects/nonexistent-id/sessions`,
      );
      expect(res.status).toBe(404);
    });

    it('returns an empty array for a new project', async () => {
      server = await startTestServer();
      const projectId = await server.createProject();

      const res = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions`,
      );
      expect(res.status).toBe(200);
      const sessions = (await res.json()) as unknown[];
      expect(sessions).toEqual([]);
    });

    it('returns sessions ordered by created_at descending', async () => {
      server = await startTestServer();
      const projectId = await server.createProject();

      // Insert two sessions directly via DB to control timing
      const db = getDb();
      const now = Date.now();
      db.prepare(
        `INSERT INTO sessions (id, project_id, free_code_session_id, free_code_ws_url, work_dir, status, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?, 'active', ?, ?)`,
      ).run('session-1', projectId, '/tmp', now, now);
      db.prepare(
        `INSERT INTO sessions (id, project_id, free_code_session_id, free_code_ws_url, work_dir, status, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, ?, 'active', ?, ?)`,
      ).run('session-2', projectId, '/tmp', now + 1, now + 1);

      const res = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions`,
      );
      expect(res.status).toBe(200);
      const sessions = (await res.json()) as Array<{ id: string }>;
      expect(sessions).toHaveLength(2);
      // Most-recently created is first
      expect(sessions[0]?.id).toBe('session-2');
      expect(sessions[1]?.id).toBe('session-1');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  POST /api/projects/:projectId/sessions                          */
  /* ---------------------------------------------------------------- */

  describe('POST /api/projects/:projectId/sessions', () => {
    it('returns 404 when project does not exist', async () => {
      server = await startTestServer();
      const res = await fetch(
        `${server.baseUrl}/api/projects/nonexistent/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      expect(res.status).toBe(404);
    });

    it('creates a session even when free-code server is unreachable', async () => {
      server = await startTestServer();
      const projectId = await server.createProject();

      const res = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );

      expect(res.status).toBe(201);
      const session = (await res.json()) as {
        id: string;
        project_id: string;
        status: string;
        free_code_session_id: string | null;
      };
      expect(session.id).toBeTruthy();
      expect(session.project_id).toBe(projectId);
      expect(session.status).toBe('active');
      // free-code session ID is null because the server was unavailable
      expect(session.free_code_session_id).toBeNull();
    });

    it('stores free-code session id when free-code server is available', async () => {
      const mockFreeCode = await startMockFreeCodeServer({
        respondWith: {
          session_id: 'fc-123',
          ws_url: 'ws://localhost:9999/sessions/fc-123',
          work_dir: '/tmp/work',
        },
      });

      try {
        server = await startTestServer(mockFreeCode.url);
        const projectId = await server.createProject();

        const res = await fetch(
          `${server.baseUrl}/api/projects/${projectId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: tmpdir() }),
          },
        );

        expect(res.status).toBe(201);
        const session = (await res.json()) as {
          free_code_session_id: string | null;
          free_code_ws_url: string | null;
          work_dir: string;
        };
        expect(session.free_code_session_id).toBe('fc-123');
        expect(session.free_code_ws_url).toBe(
          'ws://localhost:9999/sessions/fc-123',
        );
        expect(session.work_dir).toBe('/tmp/work');
      } finally {
        await mockFreeCode.close();
      }
    });

    it('falls back gracefully when free-code server returns an error', async () => {
      const mockFreeCode = await startMockFreeCodeServer({ statusCode: 500 });

      try {
        server = await startTestServer(mockFreeCode.url);
        const projectId = await server.createProject();

        const res = await fetch(
          `${server.baseUrl}/api/projects/${projectId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );

        // Session is still created in DB despite free-code error
        expect(res.status).toBe(201);
        const session = (await res.json()) as {
          id: string;
          free_code_session_id: string | null;
        };
        expect(session.id).toBeTruthy();
        expect(session.free_code_session_id).toBeNull();
      } finally {
        await mockFreeCode.close();
      }
    });

    it('passes model and system_prompt to the free-code server', async () => {
      let capturedBody: Record<string, unknown> = {};

      const { createServer: createHttpServer } = await import('node:http');
      const spyServer = createHttpServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/sessions') {
          let data = '';
          req.on('data', c => { data += c; });
          req.on('end', () => {
            capturedBody = JSON.parse(data) as Record<string, unknown>;
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                session_id: 'spy-session',
                ws_url: 'ws://localhost:0/sessions/spy-session',
              }),
            );
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>(resolve => {
        spyServer.listen(0, '127.0.0.1', () => resolve());
      });
      const spyAddr = spyServer.address() as { port: number };
      const spyUrl = `http://127.0.0.1:${spyAddr.port}`;

      try {
        server = await startTestServer(spyUrl);
        const projectId = await server.createProject();

        await fetch(`${server.baseUrl}/api/projects/${projectId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'deepseek-chat',
            system_prompt: 'You are a SysML assistant',
            max_turns: 5,
          }),
        });

        expect(capturedBody.model).toBe('deepseek-chat');
        expect(capturedBody.system_prompt).toBe('You are a SysML assistant');
        expect(capturedBody.max_turns).toBe(5);
      } finally {
        await new Promise<void>(r => { spyServer.close(() => r()); });
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /*  GET /api/projects/:projectId/sessions/:sessionId                */
  /* ---------------------------------------------------------------- */

  describe('GET /api/projects/:projectId/sessions/:sessionId', () => {
    it('returns 404 for unknown session', async () => {
      server = await startTestServer();
      const projectId = await server.createProject();

      const res = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions/not-a-real-id`,
      );
      expect(res.status).toBe(404);
    });

    it('returns the session by id', async () => {
      server = await startTestServer();
      const projectId = await server.createProject();

      const createRes = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const created = (await createRes.json()) as { id: string };

      const getRes = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions/${created.id}`,
      );
      expect(getRes.status).toBe(200);
      const fetched = (await getRes.json()) as { id: string; project_id: string };
      expect(fetched.id).toBe(created.id);
      expect(fetched.project_id).toBe(projectId);
    });

    it('does not return a session belonging to a different project', async () => {
      server = await startTestServer();
      const projectA = await server.createProject('Project A');
      const projectB = await server.createProject('Project B');

      const createRes = await fetch(
        `${server.baseUrl}/api/projects/${projectA}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const session = (await createRes.json()) as { id: string };

      // Try to fetch from a different project — should 404
      const res = await fetch(
        `${server.baseUrl}/api/projects/${projectB}/sessions/${session.id}`,
      );
      expect(res.status).toBe(404);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  DELETE /api/projects/:projectId/sessions/:sessionId             */
  /* ---------------------------------------------------------------- */

  describe('DELETE /api/projects/:projectId/sessions/:sessionId', () => {
    it('returns 404 when session does not exist', async () => {
      server = await startTestServer();
      const projectId = await server.createProject();

      const res = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions/no-such-id`,
        { method: 'DELETE' },
      );
      expect(res.status).toBe(404);
    });

    it('marks session as closed', async () => {
      server = await startTestServer();
      const projectId = await server.createProject();

      const createRes = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const session = (await createRes.json()) as { id: string };

      const deleteRes = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions/${session.id}`,
        { method: 'DELETE' },
      );
      expect(deleteRes.status).toBe(200);
      const body = (await deleteRes.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      // Session status should be 'closed' in DB
      const db = getDb();
      const updated = db
        .prepare('SELECT status FROM sessions WHERE id = ?')
        .get(session.id) as { status: string } | undefined;
      expect(updated?.status).toBe('closed');
    });

    it('notifies the free-code server to stop the session', async () => {
      let deletedSessionId: string | undefined;

      const { createServer: createHttpServer } = await import('node:http');
      const mockServer = createHttpServer((req, res) => {
        if (req.method === 'POST' && req.url === '/sessions') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              session_id: 'fc-to-delete',
              ws_url: 'ws://localhost:0/sessions/fc-to-delete',
            }),
          );
          return;
        }
        const m = /^\/sessions\/(.+)$/.exec(req.url ?? '');
        if (req.method === 'DELETE' && m) {
          deletedSessionId = m[1];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        res.writeHead(404);
        res.end();
      });

      await new Promise<void>(resolve => {
        mockServer.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = mockServer.address() as { port: number };
      const mockUrl = `http://127.0.0.1:${addr.port}`;

      try {
        server = await startTestServer(mockUrl);
        const projectId = await server.createProject();

        const createRes = await fetch(
          `${server.baseUrl}/api/projects/${projectId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        const created = (await createRes.json()) as {
          id: string;
          free_code_session_id: string | null;
        };
        expect(created.free_code_session_id).toBe('fc-to-delete');

        await fetch(
          `${server.baseUrl}/api/projects/${projectId}/sessions/${created.id}`,
          { method: 'DELETE' },
        );

        expect(deletedSessionId).toBe('fc-to-delete');
      } finally {
        await new Promise<void>(r => { mockServer.close(() => r()); });
      }
    });

    it('still marks session closed even when free-code server is unreachable', async () => {
      server = await startTestServer();
      const projectId = await server.createProject();

      // Manually insert a session with a fake free-code session id
      const db = getDb();
      const now = Date.now();
      db.prepare(
        `INSERT INTO sessions (id, project_id, free_code_session_id, free_code_ws_url, work_dir, status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, 'active', ?, ?)`,
      ).run('test-session', projectId, 'fc-unreachable', '/tmp', now, now);

      const res = await fetch(
        `${server.baseUrl}/api/projects/${projectId}/sessions/test-session`,
        { method: 'DELETE' },
      );
      expect(res.status).toBe(200);

      const updated = db
        .prepare('SELECT status FROM sessions WHERE id = ?')
        .get('test-session') as { status: string } | undefined;
      expect(updated?.status).toBe('closed');
    });
  });
});
