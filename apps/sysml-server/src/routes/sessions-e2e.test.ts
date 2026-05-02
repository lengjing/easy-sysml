/**
 * End-to-end integration tests for sysml-server sessions + chat
 *
 * These tests use a minimal free-code-compatible HTTP + WebSocket server that
 * calls the real DeepSeek API so the complete flow can be verified:
 *
 *   free-code server health/sessions API
 *   → POST /api/projects/:projectId/sessions (creates session on free-code server)
 *   → GET  /api/projects/:projectId/sessions (verify session info is stored)
 *   → GET  /api/projects/:projectId/sessions/:id (verify individual fetch)
 *   → POST /api/sessions/:id/chat (stream real AI response over SSE)
 *   → POST /api/chat (directChat full conversation flow)
 *   → DELETE /api/projects/:projectId/sessions/:id (clean up)
 *
 * The chat tests are automatically skipped when:
 *   - OPENAI_COMPAT_API_KEY is not set and no tmp credentials file exists
 *   - The DeepSeek API is not reachable from the current network
 *
 * To run locally with real credentials:
 *   cd apps/sysml-server
 *   OPENAI_COMPAT_API_KEY=sk-your-key npx vitest run src/routes/sessions-e2e.test.ts
 *
 * Credentials can also be stored in apps/sysml-server/tmp (gitignored):
 *   echo "OPENAI_COMPAT_API_KEY=sk-your-key" > apps/sysml-server/tmp
 */

import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initDb } from '../db.js';
import { projectsRouter } from './projects.js';
import { sessionsRouter } from './sessions.js';
import { chatRouter } from './chat.js';
import { directChatRouter } from './directChat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Credential resolution                                              */
/* ------------------------------------------------------------------ */

async function resolveDeepSeekKey(): Promise<string | undefined> {
  if (process.env.OPENAI_COMPAT_API_KEY) return process.env.OPENAI_COMPAT_API_KEY;
  // Try reading from apps/sysml-server/tmp (gitignored credentials file)
  const tmpFile = join(__dirname, '..', '..', 'tmp');
  try {
    const content = await readFile(tmpFile, 'utf-8');
    const match = /OPENAI_COMPAT_API_KEY=([^\s]+)/.exec(content);
    return match?.[1];
  } catch {
    return undefined;
  }
}

async function isDeepSeekReachable(apiKey: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    const r = await fetch('https://api.deepseek.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    // 200 = ok, 401 = wrong key but reachable
    return r.status === 200 || r.status === 401;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Mini free-code server launcher                                     */
/* ------------------------------------------------------------------ */

interface MiniFreeCodeServer {
  url: string;
  stop: () => Promise<void>;
}

async function startDeepSeekServer(apiKey: string): Promise<MiniFreeCodeServer> {
  const serverScript = join(__dirname, '../test-helpers/deepseek-free-code-server.mjs');

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [serverScript], {
      env: {
        ...process.env,
        OPENAI_COMPAT_API_KEY: apiKey,
        OPENAI_COMPAT_BASE_URL: 'https://api.deepseek.com/v1',
        OPENAI_COMPAT_MODEL: 'deepseek-chat',
        FREE_CODE_TEST_HOST: '127.0.0.1',
        FREE_CODE_TEST_PORT: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    let resolved = false;

    proc.stdout?.on('data', (data: Buffer) => {
      if (resolved) return;
      const line = data.toString().trim();
      try {
        const msg = JSON.parse(line) as { ready: boolean; url: string };
        if (msg.ready) {
          resolved = true;
          resolve({
            url: msg.url,
            stop: () =>
              new Promise<void>(res => {
                proc.kill('SIGTERM');
                proc.once('exit', () => res());
              }),
          });
        }
      } catch {
        // Not JSON — ignore non-ready output
      }
    });

    proc.on('error', err => {
      if (!resolved) reject(err);
    });

    proc.on('exit', code => {
      if (!resolved) {
        reject(new Error(`free-code server exited with code ${code}\nstderr: ${stderr}`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        proc.kill();
        reject(new Error(`free-code server start timeout\nstderr: ${stderr}`));
      }
    }, 15_000);
  });
}

/* ------------------------------------------------------------------ */
/*  sysml-server app factory                                           */
/* ------------------------------------------------------------------ */

async function startSysmlServer(freeCodeUrl: string) {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'sysml-e2e-'));
  initDb(join(tmpRoot, 'sysml.db'));

  process.env.FREE_CODE_SERVER_URL = freeCodeUrl;
  // Allow paths under /tmp as workspace
  process.env.FREE_CODE_WORK_DIR = tmpdir();

  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects/:projectId/sessions', sessionsRouter);
  app.use('/api/sessions/:sessionId/chat', chatRouter);
  app.use('/api/chat', directChatRouter);

  const server = createServer(app);
  await new Promise<void>(res => { server.listen(0, '127.0.0.1', () => res()); });

  const address = server.address() as { port: number };
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((res, rej) => { server.close(e => (e ? rej(e) : res())); }),
  };
}

/* ------------------------------------------------------------------ */
/*  SSE reader helper                                                  */
/* ------------------------------------------------------------------ */

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

async function collectSseEvents(
  url: string,
  body: unknown,
  timeoutMs = 60_000,
): Promise<SseEvent[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  });

  if (resp.status !== 200) {
    clearTimeout(timer);
    const errText = await resp.text().catch(() => String(resp.status));
    throw new Error(`SSE endpoint returned HTTP ${resp.status}: ${errText}`);
  }

  const events: SseEvent[] = [];
  const decoder = new TextDecoder();
  let buffer = '';

  const reader = resp.body!.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const lines = block.trim().split('\n');
        const eventLine = lines.find(l => l.startsWith('event: '));
        const dataLine = lines.find(l => l.startsWith('data: '));
        if (eventLine && dataLine) {
          try {
            events.push({
              event: eventLine.slice(7),
              data: JSON.parse(dataLine.slice(6)) as Record<string, unknown>,
            });
          } catch {
            // Ignore malformed SSE events
          }
        }
      }

      if (events.some(e => e.event === 'done')) break;
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }

  return events;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('sessions + chat end-to-end integration (real DeepSeek)', () => {
  let apiKey: string | undefined;
  let deepSeekAvailable: boolean;
  let freeCode: MiniFreeCodeServer;
  let sysml: { baseUrl: string; close: () => Promise<void> };

  beforeAll(async () => {
    apiKey = await resolveDeepSeekKey();

    if (apiKey) {
      deepSeekAvailable = await isDeepSeekReachable(apiKey);
    } else {
      deepSeekAvailable = false;
    }

    if (!apiKey) {
      console.warn('[e2e] OPENAI_COMPAT_API_KEY not found — chat tests will be skipped');
    } else if (!deepSeekAvailable) {
      console.warn('[e2e] DeepSeek API not reachable — chat tests will be skipped');
    }

    // Start the free-code server regardless (session management tests don't need DeepSeek)
    const keyToUse = apiKey ?? 'sk-placeholder-not-used';
    freeCode = await startDeepSeekServer(keyToUse);
    sysml = await startSysmlServer(freeCode.url);
  }, 30_000);

  afterAll(async () => {
    await sysml?.close();
    await freeCode?.stop();
    delete process.env.FREE_CODE_SERVER_URL;
    delete process.env.FREE_CODE_WORK_DIR;
  }, 15_000);

  /* -- helpers -- */

  async function createProject(name: string) {
    const r = await fetch(`${sysml.baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    expect(r.status).toBe(201);
    return (await r.json()) as { id: string };
  }

  /* ---------------------------------------------------------------- */
  /*  free-code server itself (always runs)                           */
  /* ---------------------------------------------------------------- */

  it('free-code server health endpoint returns ok', async () => {
    const r = await fetch(`${freeCode.url}/health`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('free-code server GET /sessions initially returns empty array', async () => {
    const r = await fetch(`${freeCode.url}/sessions`);
    expect(r.status).toBe(200);
    const sessions = await r.json();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('free-code server can create, list, and delete a session', async () => {
    const r = await fetch(`${freeCode.url}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd: tmpdir() }),
    });
    expect(r.status).toBe(201);

    const session = (await r.json()) as {
      session_id: string;
      ws_url: string;
      work_dir: string;
    };
    expect(session.session_id).toBeTruthy();
    expect(session.ws_url).toMatch(/^ws:\/\//);

    // GET /sessions should include this session
    const listR = await fetch(`${freeCode.url}/sessions`);
    const list = (await listR.json()) as Array<{ id: string }>;
    expect(list.some(s => s.id === session.session_id)).toBe(true);

    // DELETE the session
    const delR = await fetch(`${freeCode.url}/sessions/${session.session_id}`, {
      method: 'DELETE',
    });
    expect(delR.status).toBe(200);

    // Should no longer appear in the list
    const afterR = await fetch(`${freeCode.url}/sessions`);
    const after = (await afterR.json()) as Array<{ id: string }>;
    expect(after.some(s => s.id === session.session_id)).toBe(false);
  });

  /* ---------------------------------------------------------------- */
  /*  sysml-server session management (always runs)                   */
  /* ---------------------------------------------------------------- */

  it('POST /sessions creates session and stores free-code session id', async () => {
    const project = await createProject('E2E Session Test');

    const r = await fetch(
      `${sysml.baseUrl}/api/projects/${project.id}/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: tmpdir() }),
      },
    );
    expect(r.status).toBe(201);

    const session = (await r.json()) as {
      id: string;
      free_code_session_id: string | null;
      free_code_ws_url: string | null;
      status: string;
    };
    expect(session.id).toBeTruthy();
    expect(session.free_code_session_id).toBeTruthy();
    expect(session.free_code_ws_url).toMatch(/^ws:\/\//);
    expect(session.status).toBe('active');
  });

  it('GET /sessions returns sessions ordered by created_at DESC', async () => {
    const project = await createProject('Sessions Listing');

    // Create two sessions
    for (let i = 0; i < 2; i++) {
      await fetch(`${sysml.baseUrl}/api/projects/${project.id}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    }

    const listR = await fetch(`${sysml.baseUrl}/api/projects/${project.id}/sessions`);
    expect(listR.status).toBe(200);

    const sessions = (await listR.json()) as Array<{
      id: string;
      free_code_session_id: string | null;
      created_at: number;
    }>;
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    // At least one session should have a real free-code session id
    expect(sessions.some(s => s.free_code_session_id !== null)).toBe(true);
    // Verify ordered by created_at DESC (first entry is latest)
    for (let i = 1; i < sessions.length; i++) {
      const prev = sessions[i - 1];
      const curr = sessions[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      expect(prev!.created_at).toBeGreaterThanOrEqual(curr!.created_at);
    }
  });

  it('GET /sessions/:id returns session by id', async () => {
    const project = await createProject('Get By Id');
    const postR = await fetch(`${sysml.baseUrl}/api/projects/${project.id}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const created = (await postR.json()) as { id: string };

    const getR = await fetch(
      `${sysml.baseUrl}/api/projects/${project.id}/sessions/${created.id}`,
    );
    expect(getR.status).toBe(200);
    const fetched = (await getR.json()) as { id: string; free_code_session_id: string | null };
    expect(fetched.id).toBe(created.id);
  });

  it('DELETE /sessions/:id closes the session and notifies free-code server', async () => {
    const project = await createProject('Delete Test');

    const sessionR = await fetch(
      `${sysml.baseUrl}/api/projects/${project.id}/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: tmpdir() }),
      },
    );
    const session = (await sessionR.json()) as {
      id: string;
      free_code_session_id: string;
    };

    // Verify session exists on free-code server
    const beforeR = await fetch(`${freeCode.url}/sessions`);
    const beforeList = (await beforeR.json()) as Array<{ id: string }>;
    expect(beforeList.some(s => s.id === session.free_code_session_id)).toBe(true);

    // Delete via sysml-server
    const deleteR = await fetch(
      `${sysml.baseUrl}/api/projects/${project.id}/sessions/${session.id}`,
      { method: 'DELETE' },
    );
    expect(deleteR.status).toBe(200);
    const body = (await deleteR.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Session should be gone from free-code server
    const afterR = await fetch(`${freeCode.url}/sessions`);
    const afterList = (await afterR.json()) as Array<{ id: string }>;
    expect(afterList.some(s => s.id === session.free_code_session_id)).toBe(false);
  });

  /* ---------------------------------------------------------------- */
  /*  Chat with real AI (only runs when DeepSeek is reachable)        */
  /* ---------------------------------------------------------------- */

  it('POST /api/sessions/:id/chat streams real AI response over SSE', async () => {
    if (!deepSeekAvailable) {
      console.log('[e2e] Skipped: DeepSeek API not reachable');
      return;
    }

    const project = await createProject('Chat Project');

    const sessionR = await fetch(
      `${sysml.baseUrl}/api/projects/${project.id}/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd: tmpdir() }),
      },
    );
    const session = (await sessionR.json()) as { id: string };

    const events = await collectSseEvents(
      `${sysml.baseUrl}/api/sessions/${session.id}/chat`,
      { message: '用一句话介绍SysML是什么' },
      90_000,
    );

    const deltaEvents = events.filter(e => e.event === 'delta');
    const errorEvents = events.filter(e => e.event === 'error');
    const doneEvent = events.find(e => e.event === 'done');

    expect(errorEvents).toHaveLength(0);
    expect(doneEvent).toBeTruthy();
    expect(deltaEvents.length).toBeGreaterThan(0);

    const fullText = deltaEvents.map(e => e.data.content as string).join('');
    expect(fullText.length).toBeGreaterThan(5);
  }, 120_000);

  it('POST /api/chat manages session lifecycle and streams real AI response', async () => {
    if (!deepSeekAvailable) {
      console.log('[e2e] Skipped: DeepSeek API not reachable');
      return;
    }

    const events = await collectSseEvents(
      `${sysml.baseUrl}/api/chat`,
      {
        messages: [{ role: 'user', content: '用SysML v2写一个最简单的包定义' }],
        autoApply: false,
      },
      120_000,
    );

    const sessionEvent = events.find(e => e.event === 'session');
    const deltaEvents = events.filter(e => e.event === 'delta');
    const errorEvents = events.filter(e => e.event === 'error');
    const doneEvent = events.find(e => e.event === 'done');

    expect(errorEvents).toHaveLength(0);
    expect(sessionEvent?.data.conversationId).toBeTruthy();
    expect(doneEvent).toBeTruthy();
    expect(deltaEvents.length).toBeGreaterThan(0);

    const fullText = deltaEvents.map(e => e.data.content as string).join('');
    expect(fullText.length).toBeGreaterThan(5);
  }, 150_000);

  it('POST /api/chat resumes multi-turn conversation with same conversationId', async () => {
    if (!deepSeekAvailable) {
      console.log('[e2e] Skipped: DeepSeek API not reachable');
      return;
    }

    // First turn
    const firstEvents = await collectSseEvents(
      `${sysml.baseUrl}/api/chat`,
      {
        messages: [{ role: 'user', content: 'SysML的全称是什么？用一句话回答' }],
        autoApply: false,
      },
      120_000,
    );

    const sessionEvent = firstEvents.find(e => e.event === 'session');
    const conversationId = sessionEvent?.data.conversationId as string;
    expect(conversationId).toBeTruthy();

    // Second turn reusing the same conversationId
    const secondEvents = await collectSseEvents(
      `${sysml.baseUrl}/api/chat`,
      {
        messages: [
          { role: 'user', content: 'SysML的全称是什么？用一句话回答' },
          { role: 'assistant', content: '好的' },
          { role: 'user', content: '你刚才回答了什么？' },
        ],
        conversationId,
        autoApply: false,
      },
      120_000,
    );

    const secondDoneEvent = secondEvents.find(e => e.event === 'done');
    expect(secondDoneEvent).toBeTruthy();

    const secondDeltaEvents = secondEvents.filter(e => e.event === 'delta');
    expect(secondDeltaEvents.length).toBeGreaterThan(0);
  }, 240_000);
});
