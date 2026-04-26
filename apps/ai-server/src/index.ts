/**
 * AI Agent Server — Main Entry Point
 *
 * Express + WebSocket server providing a Copilot-style AI agent for SysML v2 modeling.
 * Uses Vercel AI SDK (`ai` package) for:
 *   - Native tool calling via the model's tools API (MCP-style)
 *   - Multi-step agent loops with `maxSteps`
 *   - Streaming text + tool results via SSE (HTTP) and WebSocket
 *
 * HTTP Endpoints:
 *   POST /api/chat    — streaming SSE agent (text/event-stream)
 *   GET  /api/status  — provider & configuration status
 *   POST /api/validate — direct SysML v2 validation
 *   GET  /api/stdlib   — standard library query
 *
 * WebSocket Endpoint (ws://localhost:<PORT>/api/ws):
 *   Send: { type: "chat", messages, currentCode?, autoApply? }
 *   Recv: { type: "thinking"|"delta"|"code"|"tool_call"|"error"|"done", ... }
 *
 * SSE Event Types (same as WebSocket message types):
 *   thinking   — model status message
 *   delta      — streaming text chunk (markdown content)
 *   code       — complete SysML code block extracted from response
 *   tool_call  — tool invocation details (name, status, result)
 *   error      — error message
 *   done       — stream complete
 */

import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  getProvider, getApiKey, getModelId, PROVIDER_PRESETS,
} from './provider.js';
import { validateSysML, mcpTools } from './tools.js';
import { runAgent } from './agent.js';
import type { ChatMessage } from './agent.js';

dotenv.config();

export const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------------ */
/*  SSE helpers                                                       */
/* ------------------------------------------------------------------ */

function sseWrite(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* ------------------------------------------------------------------ */
/*  POST /api/chat  — streaming SSE agent                             */
/* ------------------------------------------------------------------ */

interface ChatRequest {
  messages: ChatMessage[];
  currentCode?: string;
  autoApply?: boolean;
}

app.post('/api/chat', async (req: express.Request, res: express.Response) => {
  const { messages, currentCode, autoApply = true } = req.body as ChatRequest;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  const provider = getProvider();
  const apiKey = getApiKey(provider);
  const preset = PROVIDER_PRESETS[provider];

  if (!apiKey) {
    res.status(500).json({ error: `未配置 ${preset.label} API Key` });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    for await (const event of runAgent({ messages, currentCode, autoApply, provider })) {
      sseWrite(res, event.type, event);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '服务器错误';
    sseWrite(res, 'error', { content: message });
  } finally {
    res.end();
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/status                                                   */
/* ------------------------------------------------------------------ */

app.get('/api/status', (_req: express.Request, res: express.Response) => {
  const provider = getProvider();
  const apiKey = getApiKey(provider);
  const preset = PROVIDER_PRESETS[provider];

  res.json({
    ok: true,
    provider,
    providerLabel: preset.label,
    model: getModelId(provider),
    configured: !!apiKey,
    tools: Object.keys(mcpTools),
    wsEndpoint: '/api/ws',
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/validate  — Direct validation endpoint                  */
/* ------------------------------------------------------------------ */

app.post('/api/validate', async (req: express.Request, res: express.Response) => {
  const { code } = req.body as { code?: string };
  if (!code?.trim()) {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  try {
    const result = await validateSysML(code);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '验证失败';
    res.status(500).json({ error: message });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/stdlib  — Standard library query                         */
/* ------------------------------------------------------------------ */

app.get('/api/stdlib', async (req: express.Request, res: express.Response) => {
  const category = req.query.category as string | undefined;
  try {
    const { getStdlibFiles } = await import('@easy-sysml/language-server');
    const files: string[] = getStdlibFiles();
    const filtered = category
      ? files.filter((f: string) => f.toLowerCase().includes(category.toLowerCase()))
      : files;
    res.json({ types: filtered });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '查询失败';
    res.status(500).json({ error: message });
  }
});

/* ------------------------------------------------------------------ */
/*  WebSocket server — /api/ws                                        */
/* ------------------------------------------------------------------ */

/**
 * Create an HTTP server and attach a WebSocket server to it.
 * The WebSocket server handles connections on the `/api/ws` path.
 *
 * Message protocol (client → server):
 *   { type: "chat", messages: ChatMessage[], currentCode?: string, autoApply?: boolean }
 *
 * Message protocol (server → client):
 *   { type: "thinking"|"delta"|"code"|"tool_call"|"error"|"done", ... }
 */
export function createServer() {
  const httpServer = http.createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: '/api/ws' });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (raw: Buffer | string) => {
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', content: 'Invalid JSON' }));
        return;
      }

      if (
        typeof payload !== 'object' ||
        payload === null ||
        (payload as Record<string, unknown>).type !== 'chat'
      ) {
        ws.send(JSON.stringify({ type: 'error', content: 'Expected { type: "chat", messages: [...] }' }));
        return;
      }

      const req = payload as {
        type: 'chat';
        messages?: ChatMessage[];
        currentCode?: string;
        autoApply?: boolean;
      };

      if (!Array.isArray(req.messages) || req.messages.length === 0) {
        ws.send(JSON.stringify({ type: 'error', content: 'messages array is required' }));
        return;
      }

      const provider = getProvider();
      const apiKey = getApiKey(provider);
      const preset = PROVIDER_PRESETS[provider];

      if (!apiKey) {
        ws.send(JSON.stringify({ type: 'error', content: `未配置 ${preset.label} API Key` }));
        return;
      }

      try {
        for await (const event of runAgent({
          messages: req.messages,
          currentCode: req.currentCode,
          autoApply: req.autoApply ?? true,
          provider,
        })) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(event));
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '服务器错误';
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'error', content: message }));
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[AI WebSocket] error:', err.message);
    });
  });

  return { httpServer, wss };
}

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const PORT = parseInt(process.env.PORT || '3001', 10);
const { httpServer } = createServer();

httpServer.listen(PORT, () => {
  const provider = getProvider();
  const preset = PROVIDER_PRESETS[provider];
  console.log(`[AI Agent Server] Running on http://localhost:${PORT}`);
  console.log(`[AI Agent Server] Provider: ${preset.label} (${getModelId(provider)})`);
  console.log(`[AI Agent Server] API Key: ${getApiKey(provider) ? '✓ configured' : '✗ missing'}`);
  console.log(`[AI Agent Server] WebSocket: ws://localhost:${PORT}/api/ws`);
  const maxStepsConfig = parseInt(process.env.MAX_AGENT_STEPS || '5', 10);
  console.log(`[AI Agent Server] Agent mode: maxSteps=${maxStepsConfig} (multi-step tool calling)`);
});
