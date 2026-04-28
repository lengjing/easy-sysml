/**
 * Chat Routes — SSE streaming from free-code agent
 *
 * POST /api/sessions/:sessionId/chat
 *   Sends a message to the free-code session and streams back the response
 *   as Server-Sent Events (SSE).
 *
 * SSE Event types:
 *   delta        — partial text from the assistant
 *   thinking     — thinking/reasoning content
 *   tool_call    — tool invocation (name, status, result)
 *   result       — final result summary
 *   error        — error message
 *   done         — stream complete
 */

import { Router, type Request, type Response } from 'express';
import { WebSocket } from 'ws';
import { getDb } from '../db.js';

export const chatRouter = Router({ mergeParams: true });

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getFreeCodeServerUrl(): string {
  return process.env.FREE_CODE_SERVER_URL || 'http://localhost:3002';
}

function getFreeCodeAuthToken(): string | undefined {
  return process.env.FREE_CODE_AUTH_TOKEN;
}

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* ------------------------------------------------------------------ */
/*  POST /api/sessions/:sessionId/chat                                 */
/* ------------------------------------------------------------------ */

chatRouter.post('/', async (req: Request, res: Response) => {
  const db = getDb();
  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(req.params.sessionId) as
    | {
        id: string;
        project_id: string;
        free_code_session_id: string | null;
        free_code_ws_url: string | null;
        status: string;
      }
    | undefined;

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status !== 'active') {
    res.status(400).json({ error: 'Session is not active' });
    return;
  }

  const { message } = req.body as { message?: string };
  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // If no free-code session, fall back to simple echo
  if (!session.free_code_session_id || !session.free_code_ws_url) {
    sseWrite(res, 'error', {
      content: 'No free-code session available. Please ensure the free-code server is running.',
    });
    sseWrite(res, 'done', {});
    res.end();
    return;
  }

  // Connect to free-code via WebSocket
  const wsUrl = buildWsUrl(session.free_code_ws_url, getFreeCodeAuthToken());
  const ws = new WebSocket(wsUrl);

  let finished = false;

  const finish = () => {
    if (!finished) {
      finished = true;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      res.end();
    }
  };

  req.on('close', () => {
    finish();
  });

  ws.on('open', () => {
    // Send the message as a user turn in stream-json format
    const userMessage = JSON.stringify({ type: 'user', message: message.trim() });
    ws.send(userMessage);
  });

  ws.on('message', (data: Buffer | string) => {
    const raw = typeof data === 'string' ? data : data.toString('utf-8');

    // Messages may arrive as multiple newline-delimited JSON objects
    const lines = raw.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        handleFreeCodeMessage(res, msg);

        // End the SSE stream when we get a result message
        if (msg.type === 'result') {
          sseWrite(res, 'done', {});
          finish();
          return;
        }
      } catch {
        // Ignore invalid JSON lines
      }
    }
  });

  ws.on('error', (err: Error) => {
    if (!finished) {
      sseWrite(res, 'error', { content: `WebSocket error: ${err.message}` });
      sseWrite(res, 'done', {});
      finish();
    }
  });

  ws.on('close', () => {
    if (!finished) {
      sseWrite(res, 'done', {});
      finish();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Map free-code SDK messages to SSE events                          */
/* ------------------------------------------------------------------ */

function handleFreeCodeMessage(res: Response, msg: Record<string, unknown>): void {
  const type = msg.type as string;

  switch (type) {
    case 'assistant_partial': {
      // Streaming text delta
      const delta = msg.delta as string | undefined;
      if (delta) {
        sseWrite(res, 'delta', { content: delta });
      }
      break;
    }

    case 'assistant': {
      // Full assistant message — emit any text content blocks
      const message = msg.message as { content?: unknown[] } | undefined;
      if (message?.content) {
        for (const block of message.content) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') {
            sseWrite(res, 'delta', { content: b.text });
          } else if (b.type === 'thinking' && typeof b.thinking === 'string') {
            sseWrite(res, 'thinking', { content: b.thinking });
          } else if (b.type === 'tool_use') {
            sseWrite(res, 'tool_call', {
              id: b.id,
              name: b.name,
              input: b.input,
              status: 'running',
            });
          }
        }
      }
      break;
    }

    case 'tool_result': {
      sseWrite(res, 'tool_call', {
        id: msg.tool_use_id,
        status: msg.is_error ? 'error' : 'completed',
        result:
          Array.isArray(msg.content)
            ? (msg.content as Array<{ text?: string }>)
                .map(c => c.text ?? '')
                .join('\n')
                .slice(0, 500)
            : String(msg.content ?? '').slice(0, 500),
      });
      break;
    }

    case 'result': {
      sseWrite(res, 'result', {
        result: msg.result,
        is_error: msg.is_error,
        duration_ms: msg.duration_ms,
        total_cost_usd: msg.total_cost_usd,
      });
      break;
    }

    case 'system': {
      // Status/system messages (e.g. session start)
      if (msg.subtype === 'init') {
        sseWrite(res, 'system', { content: msg.content });
      }
      break;
    }

    case 'assistant_error': {
      sseWrite(res, 'error', { content: msg.message ?? 'Agent error' });
      break;
    }

    default:
      // Ignore other message types
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  Build WebSocket URL with optional auth token                      */
/* ------------------------------------------------------------------ */

function buildWsUrl(wsUrl: string, authToken?: string): string {
  if (!authToken) return wsUrl;
  const url = new URL(wsUrl);
  url.searchParams.set('token', authToken);
  return url.toString();
}
