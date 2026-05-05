/**
 * Direct Chat Route — POST /api/chat
 *
 * Stateful multi-turn chat endpoint. Compatible with easy-sysml's AIChatPanel.
 * Manages free-code agent sessions internally, keyed by conversationId.
 * The free-code server maintains its own conversation history — we send only
 * the current user message each turn (REPL mode).
 *
 * Request body:
 *   { message, conversationId?, autoApply?, projectId? }
 *
 * SSE event stream:
 *   session    — { conversationId }  (first event)
 *   delta      — { content }         streaming text
 *   thinking   — { content }         reasoning content
 *   tool_call  — { id, name, input?, status, result? }  tool operations
 *   code       — { content, language, autoApply, filePath }  SysML file written
 *   result     — { is_error, duration_ms, total_cost_usd, usage? }   final summary
 *   error      — { content }
 *   done       — {}
 */

import { Router, type Request, type Response } from 'express';
import { isAbsolute, relative, resolve } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { authenticateAiApiKey, recordAiApiKeyUsage, type AiApiUsage } from '../aiKeys.js';
import { getDb } from '../db.js';
import { ensureStoredProjectWorkDir } from '../projectStorage.js';

export const directChatRouter = Router();

function buildSysmlSystemPrompt(workDir: string): string {
  return `You are a professional SysML v2 Copilot embedded in the easy-sysml IDE. Help the user design, create, and modify SysML v2 models. Always respond in the same language as the user (Chinese or English).

Your current working directory is: ${workDir}
All file operations should be performed within this directory. Do not access files or run commands outside this working directory.`;
}

interface ConversationState {
  freeCodeSessionId: string;
  freeCodeWsUrl: string;
  lastActiveAt: number;
  projectId: string | null;
  workDir: string;
  /**
   * Promise that resolves when the current in-flight turn completes.
   * Used to serialize turns: a new turn must wait for the previous one to
   * finish before opening a WebSocket to the session, preventing a second
   * request from receiving messages that belong to the first request.
   */
  pendingTurn: Promise<void>;
}

interface StreamState {
  sawPartialText: boolean;
  sawPartialThinking: boolean;
}

interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const conversations = new Map<string, ConversationState>();
const DIRECT_CHAT_SESSION_MAX_AGE_MS = 9 * 60 * 1000;
const MAX_TOOL_RESULT = 800;

function buildDirectChatPermissionDeniedMessage(workDir: string): string {
  return `Access outside the project working directory is forbidden in direct chat and cannot be approved. Only files under ${workDir} are accessible. Do not ask the user for permission; explain the restriction instead.`;
}

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

function resolveDirectChatContext(projectId: string | undefined): {
  projectId: string | null;
  workDir: string;
} {
  if (!projectId) {
    return {
      projectId: null,
      workDir: getDirectChatWorkDir(),
    };
  }

  const project = getDb()
    .prepare('SELECT id, work_dir FROM projects WHERE id = ?')
    .get(projectId) as { id: string; work_dir?: string } | undefined;
  if (!project) {
    throw new Error('Project not found');
  }

  return {
    projectId: project.id,
    workDir: ensureStoredProjectWorkDir(project.id, project.work_dir),
  };
}

function freeCodeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
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

async function createFreeCodeSession(
  workDir: string,
  projectId: string | null,
): Promise<ConversationState> {
  let lastError: unknown;

  for (const baseUrl of getFreeCodeUrlCandidates()) {
    try {
      const resp = await fetch(`${baseUrl}/sessions`, {
        method: 'POST',
        headers: freeCodeHeaders(),
        body: JSON.stringify({
          cwd: workDir,
          permission_mode: 'acceptEdits',
          system_prompt: buildSysmlSystemPrompt(workDir),
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
        projectId,
        workDir,
        pendingTurn: Promise.resolve(),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

interface CanUseToolRequest {
  type: 'control_request';
  request_id: string;
  request: {
    subtype: 'can_use_tool';
    tool_name?: string;
    input?: Record<string, unknown>;
    blocked_path?: string;
  };
}

function isCanUseToolMessage(msg: unknown): msg is CanUseToolRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === 'control_request' &&
    typeof m.request_id === 'string' &&
    m.request != null &&
    typeof m.request === 'object' &&
    (m.request as Record<string, unknown>).subtype === 'can_use_tool'
  );
}

/**
 * Returns true when filePath is contained within workDir.
 * Handles Windows-style absolute paths (e.g. "D:\\...") on Linux/macOS by
 * treating them as outside the workDir.
 */
function isPathWithinWorkDir(filePath: string, workDir: string): boolean {
  // Windows absolute paths always lie outside a POSIX workDir.
  if (/^[A-Za-z]:[/\\]/.test(filePath)) {
    return false;
  }
  const abs = isAbsolute(filePath) ? filePath : resolve(workDir, filePath);
  const rel = relative(workDir, abs);
  // relative() starts with '..' when abs is outside workDir
  return !rel.startsWith('..');
}

/**
 * Determine whether a can_use_tool permission request should be allowed.
 *
 * Policy:
 *  - Bash and non-path tools run with their CWD locked to workDir and are
 *    allowed by default.
 *  - File-path tools (Read, Write, Edit, Glob, Grep, …) are allowed only
 *    when the target path is within workDir.
 */
function isToolOperationAllowed(
  request: CanUseToolRequest['request'],
  workDir: string,
): boolean {
  const toolName = request.tool_name ?? '';
  const input = request.input ?? {};

  // Bash runs with CWD = workDir (enforced by runWithCwdOverride in free-code).
  // Todo tools and similar non-path tools are safe to allow.
  if (toolName === 'Bash' || toolName === 'TodoRead' || toolName === 'TodoWrite') {
    return true;
  }

  // blocked_path, when set, is the exact path the permission system flagged.
  if (typeof request.blocked_path === 'string') {
    return isPathWithinWorkDir(request.blocked_path, workDir);
  }

  // For path-based tools inspect common input path keys.
  const pathValue = input.file_path ?? input.path ?? input.directory ?? input.dir;
  if (typeof pathValue === 'string') {
    return isPathWithinWorkDir(pathValue, workDir);
  }

  // No path info — allow by default (the session CWD is already restricted).
  return true;
}

function normalizeConversationHistory(
  rawMessages: unknown,
  currentUserMessage: string,
): ConversationHistoryMessage[] {
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  const normalized = rawMessages
    .map(message => {
      if (!message || typeof message !== 'object') {
        return null;
      }

      const role = (message as { role?: unknown }).role;
      const content = (message as { content?: unknown }).content;
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
        return null;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return null;
      }

      return {
        role,
        content: trimmed,
      } satisfies ConversationHistoryMessage;
    })
    .filter((message): message is ConversationHistoryMessage => message !== null);

  const lastMessage = normalized.at(-1);
  if (lastMessage?.role === 'user' && lastMessage.content === currentUserMessage) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function replayConversationHistory(
  ws: WebSocket,
  messages: ConversationHistoryMessage[],
): void {
  for (const message of messages) {
    if (message.role === 'user') {
      ws.send(
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: message.content,
          },
          parent_tool_use_id: null,
          session_id: '',
          isReplay: true,
        }),
      );
      continue;
    }

    ws.send(
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: message.content,
            },
          ],
        },
        session_id: '',
        isReplay: true,
      }),
    );
  }
}

directChatRouter.post('/', async (req: Request, res: Response) => {
  const {
    message,
    conversationId: clientConvId,
    autoApply = true,
    projectId,
    messages,
  } = req.body as {
    message?: string;
    conversationId?: string;
    autoApply?: boolean;
    projectId?: string;
    messages?: Array<{ role?: string; content?: string }>;
  };

  const apiKeyValue = req.header('x-easy-sysml-api-key')?.trim();
  if (!apiKeyValue) {
    res.status(401).json({ error: 'AI API key is required' });
    return;
  }

  const apiKeyAuth = authenticateAiApiKey(apiKeyValue);
  if (apiKeyAuth.status === 'invalid') {
    res.status(401).json({ error: 'AI API key is invalid or revoked' });
    return;
  }
  if (apiKeyAuth.status === 'insufficient_balance') {
    res.status(402).json({ error: 'AI API key balance exhausted, recharge required' });
    return;
  }
  const authenticatedApiKey = apiKeyAuth.record;

  const userMessage = typeof message === 'string' ? message.trim() : '';
  if (!userMessage) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  const conversationHistory = normalizeConversationHistory(messages, userMessage);

  const requestedProjectId = typeof projectId === 'string' && projectId.trim() ? projectId.trim() : undefined;
  let chatContext: { projectId: string | null; workDir: string };
  try {
    chatContext = resolveDirectChatContext(requestedProjectId);
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : 'Project not found',
    });
    return;
  }

  const responseSock = (res as unknown as { socket?: { setNoDelay?: (enabled: boolean) => void } }).socket;
  responseSock?.setNoDelay?.(true);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const convId = clientConvId || uuidv4();
  let convState = conversations.get(convId);
  const needsFreshSession = !convState;
  const shouldRefreshSession = convState
    ? Date.now() - convState.lastActiveAt > DIRECT_CHAT_SESSION_MAX_AGE_MS ||
      convState.projectId !== chatContext.projectId ||
      convState.workDir !== chatContext.workDir
    : false;

  if (!convState || shouldRefreshSession) {
    try {
      convState = await createFreeCodeSession(chatContext.workDir, chatContext.projectId);
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

  sseWrite(res, 'session', { conversationId: convId });

  // ─── Issue 1: Turn serialization ───────────────────────────────────────────
  // Replace the conversation's pendingTurn with a new promise so that the
  // *next* request on the same conversationId waits for THIS turn to finish.
  // Then await the *previous* turn before opening the WebSocket so we never
  // have two concurrent WS connections reading from the same session.
  const previousTurn = convState.pendingTurn;
  let resolveTurn!: () => void;
  convState.pendingTurn = new Promise<void>(r => {
    resolveTurn = r;
  });

  // Wait for the previous turn to complete, with a safety timeout so a
  // hung previous turn never blocks this request forever.
  await Promise.race([previousTurn, new Promise<void>(r => setTimeout(r, 30_000))]);

  // If the client disconnected while we were waiting, bail out cleanly.
  const socket = (res as unknown as { socket?: { destroyed?: boolean } }).socket;
  if (socket?.destroyed) {
    resolveTurn();
    return;
  }

  function connectAndStream(
    state: ConversationState,
    isRetry: boolean,
    shouldReplayHistory: boolean,
    onDone: () => void,
  ): void {
    const ws = new WebSocket(buildWsUrl(state.freeCodeWsUrl));
    let finished = false;
    let receivedAnyMessage = false;
    let usageRecorded = false;
    const streamState: StreamState = {
      sawPartialText: false,
      sawPartialThinking: false,
    };
    const pendingToolUses = new Map<string, { name: string; input: Record<string, unknown> }>();

    const finish = () => {
      if (finished) return;
      finished = true;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      res.end();
      // Signal that this turn is complete so queued requests can proceed.
      onDone();
    };

    res.on('close', finish);

    ws.on('open', () => {
      state.lastActiveAt = Date.now();
      if (shouldReplayHistory && conversationHistory.length > 0) {
        replayConversationHistory(ws, conversationHistory);
      }
      // Must match SDKUserMessage format expected by --input-format stream-json
      ws.send(
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: userMessage,
          },
          parent_tool_use_id: null,
          session_id: state.freeCodeSessionId,
        }),
      );
    });

    ws.on('message', (rawData: Buffer | string) => {
      receivedAnyMessage = true;
      const raw = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsedMsg = JSON.parse(trimmed) as Record<string, unknown>;

          // ─── Issue 3: Directory-based permission control ──────────────────
          // Allow tool operations within the project workDir; deny everything
          // outside.  This replaces the blanket deny-all handler and gives the
          // AI full capabilities inside the working directory.
          if (isCanUseToolMessage(parsedMsg)) {
            const allowed = isToolOperationAllowed(parsedMsg.request, state.workDir);
            ws.send(
              JSON.stringify({
                type: 'control_response',
                response: {
                  subtype: 'success',
                  request_id: parsedMsg.request_id,
                  response: allowed
                    ? { behavior: 'allow' }
                    : {
                        behavior: 'deny',
                        message: buildDirectChatPermissionDeniedMessage(state.workDir),
                      },
                },
              }),
            );
            continue;
          }

          const msg = parsedMsg;
          if (msg.type === 'result' && !usageRecorded) {
            usageRecorded = true;
            recordAiApiKeyUsage(
              authenticatedApiKey.id,
              (msg.usage ?? undefined) as AiApiUsage | undefined,
              typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : undefined,
            );
          }

          handleFreeCodeMsg(res, msg, pendingToolUses, autoApply, streamState);
          if (msg.type === 'result') {
            sseWrite(res, 'done', {});
            finish();
            return;
          }
        } catch {
          // Skip non-JSON lines (e.g. debug output)
        }
      }
    });

    ws.on('error', (err: Error) => {
      if (finished) return;

      if (!receivedAnyMessage && !isRetry) {
        conversations.delete(convId);
        createFreeCodeSession(state.workDir, state.projectId)
          .then(fresh => {
            conversations.set(convId, fresh);
            connectAndStream(fresh, true, true, onDone);
          })
          .catch((sessionErr: unknown) => {
            const errMessage = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
            sseWrite(res, 'error', { content: `会话恢复失败: ${errMessage}` });
            sseWrite(res, 'done', {});
            finish();
          });
        return;
      }

      sseWrite(res, 'error', { content: `WebSocket 错误: ${err.message}` });
      sseWrite(res, 'done', {});
      finish();
    });

    ws.on('close', () => {
      if (finished) return;

      if (!receivedAnyMessage && !isRetry) {
        conversations.delete(convId);
        createFreeCodeSession(state.workDir, state.projectId)
          .then(fresh => {
            conversations.set(convId, fresh);
            connectAndStream(fresh, true, true, onDone);
          })
          .catch((sessionErr: unknown) => {
            const errMessage = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
            sseWrite(res, 'error', { content: `会话恢复失败: ${errMessage}` });
            sseWrite(res, 'done', {});
            finish();
          });
        return;
      }

      sseWrite(res, 'done', {});
      finish();
    });
  }

  connectAndStream(convState, false, needsFreshSession || shouldRefreshSession, resolveTurn);
});

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
      const contentBlocks = (msg.message as { content?: unknown[] } | undefined)?.content;
      if (typeof contentBlocks === 'string') {
        if (contentBlocks && !streamState.sawPartialText) {
          sseWrite(res, 'delta', { content: contentBlocks });
        }
        break;
      }
      if (!Array.isArray(contentBlocks)) break;

      for (const block of contentBlocks) {
        const nextBlock = block as Record<string, unknown>;
        if (
          nextBlock.type === 'text' &&
          typeof nextBlock.text === 'string' &&
          !streamState.sawPartialText
        ) {
          sseWrite(res, 'delta', { content: nextBlock.text });
        } else if (
          nextBlock.type === 'thinking' &&
          typeof nextBlock.thinking === 'string' &&
          !streamState.sawPartialThinking
        ) {
          sseWrite(res, 'thinking', { content: nextBlock.thinking });
        } else if (nextBlock.type === 'tool_use') {
          const id = String(nextBlock.id ?? '');
          const name = String(nextBlock.name ?? 'unknown');
          const input = (nextBlock.input ?? {}) as Record<string, unknown>;
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
            .map(chunk => chunk.text ?? '')
            .join('\n')
            .slice(0, MAX_TOOL_RESULT)
        : String(msg.content ?? '').slice(0, MAX_TOOL_RESULT);

      const toolUse = pendingToolUses.get(id);
      if (!isError && toolUse?.name === 'Write') {
        const filePath = String(toolUse.input.file_path ?? toolUse.input.path ?? '');
        const fileContent = String(toolUse.input.content ?? toolUse.input.new_content ?? '');
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
        usage: msg.usage,
      });
      break;
    }

    case 'assistant_error': {
      sseWrite(res, 'error', {
        content: typeof msg.message === 'string' ? msg.message : 'Agent error',
      });
      break;
    }

    case 'server_error': {
      sseWrite(res, 'error', {
        content: typeof msg.content === 'string' ? msg.content : 'Session server error',
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
