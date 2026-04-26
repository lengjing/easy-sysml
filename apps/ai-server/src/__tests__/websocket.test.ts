/**
 * Tests for the WebSocket endpoint in apps/ai-server/src/index.ts
 *
 * Tests the /api/ws WebSocket endpoint, verifying:
 *  - Rejects malformed JSON
 *  - Rejects missing messages
 *  - Streams events for a valid chat request (mocked runAgent)
 *  - Sends error event when runAgent throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createServer } from '../index.js';

/* ------------------------------------------------------------------ */
/*  Top-level mocks                                                   */
/* ------------------------------------------------------------------ */

vi.mock('../agent.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../agent.js')>();
  return {
    ...actual,
    runAgent: vi.fn(async function* () {
      yield { type: 'delta', content: 'Hello from WS' };
      yield { type: 'done' };
    }),
  };
});

vi.mock('../tools.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tools.js')>();
  return {
    ...actual,
    validateSysML: vi.fn().mockResolvedValue({ valid: true, diagnostics: [], summary: 'OK' }),
    mcpTools: {},
  };
});

vi.mock('@easy-sysml/language-server', () => ({
  getStdlibFiles: vi.fn().mockReturnValue([]),
  createSysMLServices: vi.fn(),
  loadStdlib: vi.fn().mockResolvedValue(undefined),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

interface WSTestContext {
  server: ReturnType<typeof createServer>['httpServer'];
  port: number;
  url: string;
}

function startServer(): Promise<WSTestContext> {
  return new Promise((resolve) => {
    const { httpServer } = createServer();
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server: httpServer, port, url: `ws://127.0.0.1:${port}/api/ws` });
    });
  });
}

function stopServer(ctx: WSTestContext): Promise<void> {
  return new Promise((resolve) => {
    ctx.server.close(() => resolve());
  });
}

function connectWS(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function collectMessages(
  ws: WebSocket,
  timeout = 3000,
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve) => {
    const msgs: Array<Record<string, unknown>> = [];
    const timer = setTimeout(() => resolve(msgs), timeout);

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        msgs.push(parsed);
        if (parsed.type === 'done' || parsed.type === 'error') {
          clearTimeout(timer);
          resolve(msgs);
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.once('close', () => {
      clearTimeout(timer);
      resolve(msgs);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('WebSocket /api/ws', () => {
  let ctx: WSTestContext;

  beforeEach(async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-ws-key';
    ctx = await startServer();
  });

  afterEach(async () => {
    await stopServer(ctx);
    vi.restoreAllMocks();
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
  });

  it('sends error for malformed JSON', async () => {
    const ws = await connectWS(ctx.url);
    const messages = collectMessages(ws, 1000);
    ws.send('not valid json');
    const received = await messages;
    ws.close();
    const errMsg = received.find(m => m.type === 'error');
    expect(errMsg).toBeDefined();
  });

  it('sends error when type is not "chat"', async () => {
    const ws = await connectWS(ctx.url);
    const messages = collectMessages(ws, 1000);
    ws.send(JSON.stringify({ type: 'unknown', messages: [] }));
    const received = await messages;
    ws.close();
    const errMsg = received.find(m => m.type === 'error');
    expect(errMsg).toBeDefined();
  });

  it('sends error when messages is empty', async () => {
    const ws = await connectWS(ctx.url);
    const messages = collectMessages(ws, 1000);
    ws.send(JSON.stringify({ type: 'chat', messages: [] }));
    const received = await messages;
    ws.close();
    const errMsg = received.find(m => m.type === 'error');
    expect(errMsg).toBeDefined();
  });

  it('streams delta and done events for a valid chat request', async () => {
    const ws = await connectWS(ctx.url);
    const messages = collectMessages(ws, 3000);
    ws.send(JSON.stringify({
      type: 'chat',
      messages: [{ role: 'user', content: 'Hello WS' }],
    }));
    const received = await messages;
    ws.close();

    expect(received.some(m => m.type === 'delta')).toBe(true);
    expect(received.some(m => m.type === 'done')).toBe(true);
  });

  it('sends error event when runAgent throws', async () => {
    const agentModule = await import('../agent.js');
    vi.mocked(agentModule.runAgent).mockImplementationOnce(async function* () {
      throw new Error('WS agent failure');
    });

    const ws = await connectWS(ctx.url);
    const messages = collectMessages(ws, 3000);
    ws.send(JSON.stringify({
      type: 'chat',
      messages: [{ role: 'user', content: 'trigger error' }],
    }));
    const received = await messages;
    ws.close();

    const errMsg = received.find(m => m.type === 'error');
    expect(errMsg).toBeDefined();
    expect(typeof errMsg?.content).toBe('string');
  });
});
