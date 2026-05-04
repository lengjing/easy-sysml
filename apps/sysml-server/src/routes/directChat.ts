/**
 * Direct Chat Route — POST /api/chat
 *
 * Stateful multi-turn chat endpoint. Compatible with easy-sysml's AIChatPanel.
 * Manages free-code agent sessions internally, keyed by conversationId.
 *
 * Request body:
 *   { messages, currentCode?, conversationId?, autoApply? }
 *
 * SSE event stream:
 *   session    — { conversationId }  (first event)
 *   delta      — { content }         streaming text
 *   thinking   — { content }         reasoning content
 *   tool_call  — { id, name, input?, status, result? }  tool operations
 *   code       — { content, language, autoApply, filePath }  SysML file written
 *   result     — { is_error, duration_ms, total_cost_usd }   final summary
 *   error      — { content }
 *   done       — {}
 */

import { Router, type Request, type Response } from 'express';
import { resolve } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

export const directChatRouter = Router();

/* ------------------------------------------------------------------ */
/*  SysML v2 system prompt for the agent                              */
/* ------------------------------------------------------------------ */

const SYSML_SYSTEM_PROMPT = `You are SysML Copilot, a SysML v2 modeling agent embedded in the easy-sysml IDE.

Your capabilities:
- Create and modify SysML v2 model files using the Write tool
- Read existing model files using the Read tool
- Execute validation commands using the Bash tool
- Navigate the project structure using ListDir, Glob, and Grep tools

SysML v2 syntax reference:
- \`package\`          — top-level namespace container
- \`part def\`         — component/block definition  
- \`part\`             — part usage (instance within context)
- \`attribute\`        — typed attribute (e.g., attribute mass : Real;)
- \`port def\` / \`port\` — interface definitions / usages
- \`requirement def\` / \`requirement\` — requirements modeling
- \`action def\` / \`action\` — behavior modeling
- \`state def\` / \`state\` — state machine modeling
- \`:>\`               — specialization (subtype relationship)
- \`:\`                — typing (type annotation)
- \`import\`           — importing packages

When asked to create or modify SysML models:
1. Use the Write tool to save .sysml files to the working directory
2. Use meaningful package and element names
3. Add \`doc\` comments for important elements
4. Keep each file focused on one subsystem or concern

Always respond in the same language as the user (Chinese or English).`;

/* ------------------------------------------------------------------ */
/*  In-memory conversation state                                      */
/* ------------------------------------------------------------------ */

interface ConversationState {
  freeCodeSessionId: string;
  freeCodeWsUrl: string;
  lastActiveAt: number;
  needsBootstrap: boolean;
}

interface StreamState {
  sawPartialText: boolean;
  sawPartialThinking: boolean;
}

const conversations = new Map<string, ConversationState>();
const DIRECT_CHAT_SESSION_MAX_AGE_MS = 9 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 12;

// Evict stale conversations every 5 minutes
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 min
setInterval(
  () => {
    const now = Date.now();
    for (const [id, state] of conversations.entries()) {
      if (now - state.lastActiveAt > CONVERSATION_TTL) {
        conversations.delete(id);
      }
    }
  },
  5 * 60 * 1000,
).unref();

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getFreeCodeUrl(): string {
  return process.env.FREE_CODE_SERVER_URL || 'http://localhost:3002';
}

function getFreeCodeUrlCandidates(): string[] {
  const primary = getFreeCodeUrl();
  const candidates = [primary];

  try {
    const url = new URL(primary);
    if (url.hostname === 'localhost') {
      const ipv4Url = new URL(primary);
      ipv4Url.hostname = '127.0.0.1';
      candidates.push(ipv4Url.toString().replace(/\/$/, ''));
    }
  } catch {
    // Keep the configured URL as-is if it is not a standard absolute URL.
  }

  return [...new Set(candidates)];
}

function getAuthToken(): string | undefined {
  return process.env.FREE_CODE_AUTH_TOKEN;
}

function getDirectChatWorkDir(): string {
  return resolve(process.env.FREE_CODE_WORK_DIR || process.cwd());
}

function freeCodeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function buildWsUrl(wsUrl: string): string {
  const token = getAuthToken();
  if (!token) return wsUrl;
  const url = new URL(wsUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const MAX_TOOL_RESULT = 800;

function buildUserTurnContent(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentCode: string | undefined,
  includeBootstrap: boolean,
): string {
  const lastUserMessage = [...messages].reverse().find(message => message.role === 'user');
  const content = lastUserMessage?.content ?? '';
  const parts: string[] = [];

  if (includeBootstrap) {
    parts.push(SYSML_SYSTEM_PROMPT);

    const previousMessages = messages.slice(0, -1).slice(-MAX_HISTORY_MESSAGES);
    if (previousMessages.length > 0) {
      const formattedHistory = previousMessages
        .map(message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.trim()}`)
        .join('\n\n');
      parts.push(`Conversation so far:\n${formattedHistory}`);
    }
  }

  if (currentCode?.trim()) {
    parts.push(`Current editor code:\n\`\`\`sysml\n${currentCode.trim()}\n\`\`\``);
  }

  if (parts.length === 0) {
    return content;
  }

  parts.push(`User request:\n${content}`);
  return parts.join('\n\n');
}

/* ------------------------------------------------------------------ */
/*  POST /api/chat                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a fresh free-code session and return its state.
 * The system_prompt captures the current editor code context so the agent
 * always starts with up-to-date information.
 */
async function createFreeCodeSession(): Promise<ConversationState> {
  let lastError: unknown;

  for (const baseUrl of getFreeCodeUrlCandidates()) {
    try {
      const resp = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: freeCodeHeaders(),
        body: JSON.stringify({
          dangerously_skip_permissions: true,
          cwd: getDirectChatWorkDir(),
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => String(resp.status));
        throw new Error(`无法创建 free-code 会话: ${errText}`);
      }

      const { session_id, ws_url } = (await resp.json()) as {
        session_id: string;
        ws_url: string;
      };

      return {
        freeCodeSessionId: session_id,
        freeCodeWsUrl: ws_url,
        lastActiveAt: Date.now(),
        needsBootstrap: true,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

directChatRouter.post('/', async (req: Request, res: Response) => {
  const {
    messages,
    currentCode,
    conversationId: clientConvId,
    autoApply = true,
  } = req.body as {
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    currentCode?: string;
    conversationId?: string;
    autoApply?: boolean;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required' });
    return;
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) {
    res.status(400).json({ error: 'No user message found' });
    return;
  }
  const requestMessages = messages;

  // Disable Nagle's algorithm for this connection immediately so every
  // res.write() call results in an immediate TCP segment — this is the key
  // to getting character-by-character SSE streaming to the browser.
  const responseSock = (res as unknown as { socket?: { setNoDelay?: (v: boolean) => void } }).socket;
  responseSock?.setNoDelay?.(true);

  // Send SSE headers immediately
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const convId = clientConvId || uuidv4();

  /* ---------- Reuse existing session or create a new one ---------- */
  let convState = conversations.get(convId);
  const shouldRefreshSession = convState
    ? Date.now() - convState.lastActiveAt > DIRECT_CHAT_SESSION_MAX_AGE_MS
    : false;

  if (!convState || shouldRefreshSession) {
    try {
      convState = await createFreeCodeSession();
      conversations.set(convId, convState);
    } catch (err) {
      sseWrite(res, 'error', {
        content: `无法连接 free-code 服务器 (${getFreeCodeUrl()}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      sseWrite(res, 'done', {});
      res.end();
      return;
    }
  } else {
    convState.lastActiveAt = Date.now();
  }

  // Acknowledge the conversation ID to the client
  sseWrite(res, 'session', { conversationId: convId });

  /* ---------- Connect to free-code WebSocket and send message ---------- */

  /**
   * Attempt to connect to a free-code session WebSocket and stream the
   * response.  If the session has died (e.g. idle-timeout), the WS will
   * fail immediately (before any message is received).  In that case we
   * create a fresh session and retry exactly once.
   */
  function connectAndStream(state: ConversationState, isRetry: boolean): void {
    const ws = new WebSocket(buildWsUrl(state.freeCodeWsUrl));
    let finished = false;
    let receivedAnyMessage = false;
    const streamState: StreamState = {
      sawPartialText: false,
      sawPartialThinking: false,
    };
    const pendingToolUses = new Map<
      string,
      { name: string; input: Record<string, unknown> }
    >();

    const finish = () => {
      if (finished) return;
      finished = true;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      res.end();
    };

    res.on('close', finish);

    ws.on('open', () => {
      const userContent = buildUserTurnContent(
        requestMessages,
        currentCode,
        state.needsBootstrap,
      );
      state.needsBootstrap = false;
      state.lastActiveAt = Date.now();
      ws.send(
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: userContent,
          },
          parent_tool_use_id: null,
          session_id: state.freeCodeSessionId,
        }),
      );
    });

    ws.on('message', (rawData: Buffer | string) => {
      receivedAnyMessage = true;
      const raw =
        typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;
          handleFreeCodeMsg(
            res,
            msg,
            pendingToolUses,
            autoApply,
            streamState,
          );
          if (msg.type === 'result') {
            sseWrite(res, 'done', {});
            finish();
            return;
          }
        } catch {
          // skip non-JSON lines (e.g. debug output)
        }
      }
    });

    ws.on('error', (err: Error) => {
      if (finished) return;
      if (!receivedAnyMessage && !isRetry) {
        // Session likely died (idle timeout).  Remove the stale entry and
        // retry once with a brand-new session.
        conversations.delete(convId);
        createFreeCodeSession()
          .then(fresh => {
            conversations.set(convId, fresh);
            connectAndStream(fresh, true);
          })
          .catch((sessionErr: unknown) => {
            const msg = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
            sseWrite(res, 'error', { content: `会话恢复失败: ${msg}` });
            sseWrite(res, 'done', {});
            finish();
          });
      } else {
        sseWrite(res, 'error', { content: `WebSocket 错误: ${err.message}` });
        sseWrite(res, 'done', {});
        finish();
      }
    });

    ws.on('close', () => {
      if (finished) return;
      if (!receivedAnyMessage && !isRetry) {
        // Session closed immediately (process already dead).  Retry once.
        conversations.delete(convId);
          createFreeCodeSession()
          .then(fresh => {
            conversations.set(convId, fresh);
            connectAndStream(fresh, true);
          })
          .catch((sessionErr: unknown) => {
            const msg = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
            sseWrite(res, 'error', { content: `会话恢复失败: ${msg}` });
            sseWrite(res, 'done', {});
            finish();
          });
      } else {
        sseWrite(res, 'done', {});
        finish();
      }
    });
  }

  connectAndStream(convState, false);
});

/* ------------------------------------------------------------------ */
/*  Map free-code messages → SSE events                               */
/* ------------------------------------------------------------------ */

export function handleFreeCodeMsg(
  res: Response,
  msg: Record<string, unknown>,
  pendingToolUses: Map<string, { name: string; input: Record<string, unknown> }>,
  autoApply: boolean,
  streamState: StreamState = {
    sawPartialText: false,
    sawPartialThinking: false,
  },
): void {
  switch (msg.type as string) {
    case 'assistant_partial': {
      const delta = msg.delta;
      if (typeof delta === 'string' && delta) {
        streamState.sawPartialText = true;
        sseWrite(res, 'delta', { content: delta });
      }
      break;
    }

    case 'stream_event': {
      const event = msg.event as Record<string, unknown> | undefined;
      const delta = event?.delta as Record<string, unknown> | undefined;
      if (event?.type !== 'content_block_delta' || !delta) {
        break;
      }

      if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
        streamState.sawPartialText = true;
        sseWrite(res, 'delta', { content: delta.text });
      } else if (
        delta.type === 'thinking_delta' &&
        typeof delta.thinking === 'string' &&
        delta.thinking
      ) {
        streamState.sawPartialThinking = true;
        sseWrite(res, 'thinking', { content: delta.thinking });
      }
      break;
    }

    case 'assistant': {
      // Full assistant turn — process content blocks
      const contentBlocks = (
        msg.message as { content?: unknown[] } | undefined
      )?.content;
      if (typeof contentBlocks === 'string') {
        if (contentBlocks && !streamState.sawPartialText) {
          sseWrite(res, 'delta', { content: contentBlocks });
        }
        break;
      }
      if (!Array.isArray(contentBlocks)) break;

      for (const block of contentBlocks) {
        const b = block as Record<string, unknown>;
        if (
          b.type === 'text' &&
          typeof b.text === 'string' &&
          !streamState.sawPartialText
        ) {
          sseWrite(res, 'delta', { content: b.text });
        } else if (
          b.type === 'thinking' &&
          typeof b.thinking === 'string' &&
          !streamState.sawPartialThinking
        ) {
          sseWrite(res, 'thinking', { content: b.thinking });
        } else if (b.type === 'tool_use') {
          const id = String(b.id ?? '');
          const name = String(b.name ?? 'unknown');
          const input = (b.input ?? {}) as Record<string, unknown>;
          pendingToolUses.set(id, { name, input });
          sseWrite(res, 'tool_call', { id, name, input, status: 'running' });
        }
      }
      break;
    }

    case 'tool_result': {
      const id = String(msg.tool_use_id ?? '');
      const isError = Boolean(msg.is_error);
      const resultText = Array.isArray(msg.content)
        ? (msg.content as Array<{ text?: string }>)
            .map(c => c.text ?? '')
            .join('\n')
            .slice(0, MAX_TOOL_RESULT)
        : String(msg.content ?? '').slice(0, MAX_TOOL_RESULT);

      // Detect Write to a .sysml file → emit code event for editor sync
      const tu = pendingToolUses.get(id);
      if (!isError && tu?.name === 'Write') {
        const filePath = String(
          tu.input.file_path ?? tu.input.path ?? '',
        );
        const fileContent = String(
          tu.input.content ?? tu.input.new_content ?? '',
        );
        if (filePath.endsWith('.sysml') && fileContent) {
          sseWrite(res, 'code', {
            content: fileContent,
            language: 'sysml',
            autoApply,
            filePath,
          });
        }
      }
      pendingToolUses.delete(id);

      sseWrite(res, 'tool_call', {
        id,
        status: isError ? 'error' : 'completed',
        result: resultText,
      });
      break;
    }

    case 'result': {
      sseWrite(res, 'result', {
        result: msg.result,
        is_error: Boolean(msg.is_error),
        duration_ms: msg.duration_ms,
        total_cost_usd: msg.total_cost_usd,
      });
      break;
    }

    case 'assistant_error': {
      sseWrite(res, 'error', {
        content:
          typeof msg.message === 'string' ? msg.message : 'Agent error',
      });
      break;
    }

    case 'server_error': {
      sseWrite(res, 'error', {
        content:
          typeof msg.content === 'string' ? msg.content : 'Session server error',
      });
      break;
    }

    case 'server_session_done': {
      const exitCode = Number(msg.exit_code ?? 0);
      if (exitCode !== 0) {
        sseWrite(res, 'error', {
          content: `free-code session exited with code ${exitCode}`,
        });
      }
      break;
    }

    default:
      break;
  }
}
