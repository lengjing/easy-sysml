#!/usr/bin/env node
/**
 * deepseek-free-code-server.mjs
 *
 * A minimal free-code HTTP + WebSocket server that uses the real DeepSeek API
 * to process user messages. Speaks the same stream-json protocol as the
 * official free-code server.
 *
 * HTTP API:
 *   GET  /health          → { status, sessions }
 *   GET  /sessions        → SessionInfo[]
 *   POST /sessions        → { session_id, ws_url, work_dir }
 *   DELETE /sessions/:id  → { ok }
 *
 * WebSocket at /sessions/:id:
 *   Client → sends { type: 'user', message: string | { content: string } }
 *   Server → streams assistant_partial, assistant, result messages back
 *
 * Environment variables:
 *   OPENAI_COMPAT_API_KEY   Required: DeepSeek API key
 *   OPENAI_COMPAT_BASE_URL  Optional: defaults to https://api.deepseek.com/v1
 *   OPENAI_COMPAT_MODEL     Optional: defaults to deepseek-chat
 *   FREE_CODE_TEST_PORT     Optional: port to listen on (default 0 = random)
 *   FREE_CODE_TEST_HOST     Optional: host to bind (default 127.0.0.1)
 *
 * Prints exactly one line to stdout once ready:
 *   { "ready": true, "port": <N>, "url": "http://127.0.0.1:<N>" }
 */

import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const API_KEY = process.env.OPENAI_COMPAT_API_KEY;
const BASE_URL = process.env.OPENAI_COMPAT_BASE_URL || 'https://api.deepseek.com/v1';
const MODEL = process.env.OPENAI_COMPAT_MODEL || 'deepseek-chat';
const HOST = process.env.FREE_CODE_TEST_HOST || '127.0.0.1';
const PORT = parseInt(process.env.FREE_CODE_TEST_PORT || '0', 10);

if (!API_KEY) {
  process.stderr.write('[deepseek-server] OPENAI_COMPAT_API_KEY is not set\n');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  In-memory session store                                            */
/* ------------------------------------------------------------------ */

/** @type {Map<string, { id: string, status: string, createdAt: number, workDir: string, history: Array<{role:string,content:string}> }>} */
const sessions = new Map();

/* ------------------------------------------------------------------ */
/*  DeepSeek call (streaming)                                          */
/* ------------------------------------------------------------------ */

/**
 * Calls DeepSeek with a given message history and streams the response.
 * @param {Array<{role:string,content:string}>} messages
 * @param {(delta: string) => void} onDelta - called for each streaming token
 * @returns {Promise<string>} the full response text
 */
async function callDeepSeek(messages, onDelta) {
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      max_tokens: 512,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => String(resp.status));
    throw new Error(`DeepSeek API error ${resp.status}: ${errText}`);
  }

  let fullText = '';
  const decoder = new TextDecoder();

  for await (const chunk of resp.body) {
    const text = decoder.decode(chunk, { stream: true });
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        const delta = data.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onDelta(delta);
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  return fullText;
}

/* ------------------------------------------------------------------ */
/*  JSON response helper                                               */
/* ------------------------------------------------------------------ */

/** @param {import('node:http').ServerResponse} res */
function jsonResponse(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(data);
}

/* ------------------------------------------------------------------ */
/*  HTTP server                                                        */
/* ------------------------------------------------------------------ */

const httpServer = createHttpServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);

  // GET /health
  if (req.method === 'GET' && url.pathname === '/health') {
    jsonResponse(res, 200, { status: 'ok', sessions: sessions.size });
    return;
  }

  // GET /sessions
  if (req.method === 'GET' && url.pathname === '/sessions') {
    const list = Array.from(sessions.values()).map(s => ({
      id: s.id,
      status: s.status,
      created_at: s.createdAt,
      work_dir: s.workDir,
    }));
    jsonResponse(res, 200, list);
    return;
  }

  // POST /sessions
  if (req.method === 'POST' && url.pathname === '/sessions') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let opts = {};
      try { opts = JSON.parse(body); } catch {}

      const id = randomUUID();
      const workDir = opts.cwd || opts.work_dir || '/tmp';
      const session = {
        id,
        status: 'running',
        createdAt: Date.now(),
        workDir,
        history: [],
      };
      if (opts.system_prompt) {
        session.history.push({ role: 'system', content: opts.system_prompt });
      }
      sessions.set(id, session);

      const actualPort = httpServer.address().port;
      jsonResponse(res, 201, {
        session_id: id,
        ws_url: `ws://${HOST}:${actualPort}/sessions/${id}`,
        work_dir: workDir,
      });
    });
    return;
  }

  // DELETE /sessions/:id
  const deleteMatch = /^\/sessions\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'DELETE' && deleteMatch) {
    const id = deleteMatch[1];
    const deleted = sessions.delete(id);
    jsonResponse(res, deleted ? 200 : 404, { ok: deleted });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

/* ------------------------------------------------------------------ */
/*  WebSocket server — handles AI conversation                        */
/* ------------------------------------------------------------------ */

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${HOST}`);
  const match = /^\/sessions\/([^/]+)$/.exec(url.pathname);
  if (!match) {
    socket.destroy();
    return;
  }
  const sessionId = match[1];
  if (!sessions.has(sessionId)) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit('connection', ws, sessionId);
  });
});

wss.on('connection', (ws, sessionId) => {
  const session = sessions.get(sessionId);

  ws.on('message', async rawData => {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch {
      return;
    }

    if (msg.type !== 'user') return;

    // Extract user content
    const userContent =
      typeof msg.message === 'string'
        ? msg.message
        : typeof msg.message?.content === 'string'
          ? msg.message.content
          : typeof msg.message === 'object' && msg.message !== null
            ? JSON.stringify(msg.message)
            : '';

    if (!userContent.trim()) return;

    session.history.push({ role: 'user', content: userContent });

    const startMs = Date.now();
    let fullText = '';

    // Build messages for DeepSeek: keep only the first system message (no duplicates)
    const firstSystemIdx = session.history.findIndex(m => m.role === 'system');
    const messagesForApi = session.history.filter(
      (m, idx) => m.role !== 'system' || idx === firstSystemIdx,
    );

    try {
      fullText = await callDeepSeek(
        messagesForApi,
        delta => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'assistant_partial', delta }));
          }
        },
      );

      session.history.push({ role: 'assistant', content: fullText });

      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: fullText }],
            },
          }),
        );

        ws.send(
          JSON.stringify({
            type: 'result',
            is_error: false,
            result: fullText,
            duration_ms: Date.now() - startMs,
            total_cost_usd: 0,
          }),
        );
      }
    } catch (err) {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'assistant_error',
            message: err instanceof Error ? err.message : String(err),
          }),
        );
        ws.send(
          JSON.stringify({
            type: 'result',
            is_error: true,
            result: err instanceof Error ? err.message : String(err),
            duration_ms: Date.now() - startMs,
          }),
        );
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Start listening                                                    */
/* ------------------------------------------------------------------ */

httpServer.listen(PORT, HOST, () => {
  const { port } = httpServer.address();
  // Signal readiness to the parent process
  process.stdout.write(
    JSON.stringify({ ready: true, port, url: `http://${HOST}:${port}` }) + '\n',
  );
});

// Graceful shutdown
process.on('SIGTERM', () => {
  httpServer.close();
  wss.close();
  process.exit(0);
});
