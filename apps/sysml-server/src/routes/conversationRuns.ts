import { Router, type Request, type Response } from 'express';
import { WebSocket } from 'ws';
import { authenticateAiApiKey, recordAiApiKeyUsage, type AiApiUsage } from '../aiKeys.js';
import {
  appendConversationMessage,
  completeConversationRun,
  createConversationRun,
  getConversation,
  getConversationRun,
  getProjectContext,
  listConversationHistoryForReplay,
  listConversationRuns,
  setConversationUpstreamSessionId,
} from '../conversationStore.js';
import {
  buildAgentServerHeaders,
  getProjectAgentServerEndpoint,
} from '../projectServerManager.js';

export const conversationRunsRouter = Router({ mergeParams: true });

const MAX_TOOL_RESULT = 800;
const pendingConversationRuns = new Map<string, Promise<void>>();
const WRITE_LIKE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

interface RuntimeContext {
  projectId: string;
  conversationId: string;
  workDir: string;
  baseUrl: string;
  authToken?: string;
  upstreamSessionId: string;
}

interface StreamState {
  sawPartialText: boolean;
  sawPartialThinking: boolean;
}

interface ReplayMessage {
  role: 'user' | 'assistant';
  content: string;
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

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function buildSysmlSystemPrompt(workDir: string): string {
  return `You are a professional SysML v2 Copilot embedded in the easy-sysml IDE. Help the user design, create, and modify SysML v2 models. Always respond in the same language as the user (Chinese or English).

Your current working directory is: ${workDir}
All file operations should be performed within this directory. Do not access files or run commands outside this working directory.`;
}

function buildSessionWsUrl(baseUrl: string, sessionId: string): string {
  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.pathname = `/sessions/${encodeURIComponent(sessionId)}/ws`;
  wsUrl.search = '';
  return wsUrl.toString();
}

function buildWsUrl(wsUrl: string, authToken?: string): string {
  if (!authToken) {
    return wsUrl;
  }

  const url = new URL(wsUrl);
  url.searchParams.set('token', authToken);
  return url.toString();
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

function isToolOperationAllowed(request: CanUseToolRequest['request'], workDir: string): boolean {
  void request;
  void workDir;
  return true;
}

function isSysmlWriteToolInput(input: Record<string, unknown>): boolean {
  const filePathValue = input.file_path ?? input.path ?? input.new_path;
  return typeof filePathValue === 'string' && filePathValue.toLowerCase().endsWith('.sysml');
}

function replayConversationHistory(ws: WebSocket, messages: ReplayMessage[]): void {
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
          content: [{ type: 'text', text: message.content }],
        },
        session_id: '',
        isReplay: true,
      }),
    );
  }
}

async function createUpstreamSession(
  projectId: string,
  conversationId: string,
  workDir: string,
): Promise<RuntimeContext> {
  const endpoint = await getProjectAgentServerEndpoint(projectId, workDir);
  const response = await fetch(`${endpoint.baseUrl}/sessions`, {
    method: 'POST',
    headers: buildAgentServerHeaders(endpoint.authToken, true),
    body: JSON.stringify({
      cwd: workDir,
      dangerously_skip_permissions: true,
      system_prompt: buildSysmlSystemPrompt(workDir),
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || 'Unable to create Claude session');
  }

  const payload = (await response.json()) as { session_id: string };
  setConversationUpstreamSessionId(projectId, conversationId, payload.session_id);

  return {
    projectId,
    conversationId,
    workDir,
    baseUrl: endpoint.baseUrl,
    authToken: endpoint.authToken,
    upstreamSessionId: payload.session_id,
  };
}

async function resolveRuntimeContext(
  projectId: string,
  conversationId: string,
  forceNewSession = false,
): Promise<RuntimeContext> {
  const project = getProjectContext(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const conversation = getConversation(projectId, conversationId);
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (forceNewSession || !conversation.upstream_session_id) {
    return await createUpstreamSession(projectId, conversationId, project.workDir);
  }

  const endpoint = await getProjectAgentServerEndpoint(project.id, project.workDir);
  return {
    projectId: project.id,
    conversationId,
    workDir: project.workDir,
    baseUrl: endpoint.baseUrl,
    authToken: endpoint.authToken,
    upstreamSessionId: conversation.upstream_session_id,
  };
}

function queueConversationRun(conversationId: string): { previous: Promise<void>; release: () => void } {
  const previous = pendingConversationRuns.get(conversationId) ?? Promise.resolve();
  let resolveRun: () => void = () => undefined;
  const current = new Promise<void>(resolve => {
    resolveRun = resolve;
  });
  pendingConversationRuns.set(conversationId, current);

  return {
    previous,
    release: () => {
      if (pendingConversationRuns.get(conversationId) === current) {
        pendingConversationRuns.delete(conversationId);
      }
      resolveRun();
    },
  };
}

conversationRunsRouter.get('/', (req: Request, res: Response) => {
  const runs = listConversationRuns(req.params.projectId, req.params.conversationId);
  if (!runs) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json(runs);
});

conversationRunsRouter.get('/:runId', (req: Request, res: Response) => {
  const run = getConversationRun(req.params.projectId, req.params.conversationId, req.params.runId);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  res.json(run);
});

conversationRunsRouter.post('/', async (req: Request, res: Response) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

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

  const conversation = getConversation(req.params.projectId, req.params.conversationId);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const userMessage = appendConversationMessage(req.params.projectId, req.params.conversationId, {
    role: 'user',
    content: message,
  });
  if (!userMessage) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const run = createConversationRun(req.params.projectId, req.params.conversationId, userMessage.id);
  if (!run) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const history =
    listConversationHistoryForReplay(
      req.params.projectId,
      req.params.conversationId,
      userMessage.id,
    ) ?? [];

  const responseSock = (res as unknown as { socket?: { setNoDelay?: (enabled: boolean) => void } }).socket;
  responseSock?.setNoDelay?.(true);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  sseWrite(res, 'conversation', { conversationId: req.params.conversationId });
  sseWrite(res, 'run', { runId: run.id, status: run.status });

  const queuedTurn = queueConversationRun(req.params.conversationId);
  await Promise.race([queuedTurn.previous, new Promise<void>(resolve => setTimeout(resolve, 30_000))]);

  const socket = (res as unknown as { socket?: { destroyed?: boolean } }).socket;
  if (socket?.destroyed) {
    queuedTurn.release();
    return;
  }

  let runtime: RuntimeContext;
  try {
    runtime = await resolveRuntimeContext(req.params.projectId, req.params.conversationId);
  } catch (error) {
    const errorText = error instanceof Error ? error.message : 'Unable to resolve runtime context';
    appendConversationMessage(req.params.projectId, req.params.conversationId, {
      role: 'error',
      runId: run.id,
      content: errorText,
    });
    completeConversationRun(req.params.projectId, req.params.conversationId, run.id, {
      status: 'failed',
      errorText,
    });
    sseWrite(res, 'error', { content: errorText });
    sseWrite(res, 'done', {});
    res.end();
    queuedTurn.release();
    return;
  }

  const pendingToolUses = new Map<string, { index: number; name: string; input: Record<string, unknown> }>();
  const toolCalls: Array<{
    id?: string;
    name: string;
    input?: Record<string, unknown>;
    status: 'running' | 'completed' | 'error';
    result?: string;
    timestamp: number;
  }> = [];
  const thinkingSteps: Array<{ content: string; timestamp: number }> = [];
  const streamState: StreamState = { sawPartialText: false, sawPartialThinking: false };
  let assistantContent = '';
  let codeCount = 0;
  let durationMs: number | undefined;
  let usage: Record<string, unknown> | undefined;
  let model: string | undefined;
  let errorText: string | null = null;
  let usageRecorded = false;
  let finished = false;
  let sawAnyMessage = false;
  let sawResult = false;

  const finalize = (ws?: WebSocket) => {
    if (finished) {
      return;
    }
    finished = true;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }

    let assistantMessageId: string | null = null;
    if (assistantContent || toolCalls.length > 0 || thinkingSteps.length > 0) {
      const thinkingDurationMs =
        thinkingSteps.length > 1
          ? thinkingSteps[thinkingSteps.length - 1]!.timestamp - thinkingSteps[0]!.timestamp
          : undefined;
      const assistantMessage = appendConversationMessage(req.params.projectId, req.params.conversationId, {
        role: 'assistant',
        runId: run.id,
        content: assistantContent,
        provider: 'claude',
        thinkingSteps,
        toolCalls,
        codesSynced: codeCount,
        durationMs,
        thinkingDurationMs,
      });
      assistantMessageId = assistantMessage?.id ?? null;
    }

    if (errorText) {
      appendConversationMessage(req.params.projectId, req.params.conversationId, {
        role: 'error',
        runId: run.id,
        content: errorText,
      });
    }

    completeConversationRun(req.params.projectId, req.params.conversationId, run.id, {
      assistantMessageId,
      model,
      usage,
      errorText,
      status: errorText ? 'failed' : 'completed',
    });

    sseWrite(res, 'done', {});
    res.end();
    queuedTurn.release();
  };

  const connectAndStream = async (context: RuntimeContext, retried: boolean): Promise<void> => {
    const ws = new WebSocket(buildWsUrl(buildSessionWsUrl(context.baseUrl, context.upstreamSessionId), context.authToken));

    res.once('close', () => {
      errorText ??= 'Client disconnected';
      finalize(ws);
    });

    ws.on('open', () => {
      if (history.length > 0 && (!conversation.upstream_session_id || retried)) {
        replayConversationHistory(ws, history);
      }

      ws.send(
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: message,
          },
          parent_tool_use_id: null,
          session_id: context.upstreamSessionId,
        }),
      );
    });

    ws.on('message', async rawData => {
      sawAnyMessage = true;
      const raw = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>;

          if (isCanUseToolMessage(msg)) {
            const allowed = isToolOperationAllowed(msg.request, context.workDir);
            const decision = allowed ? { behavior: 'allow' as const } : { behavior: 'deny' as const };
            ws.send(
              JSON.stringify({
                type: 'control_response',
                request_id: msg.request_id,
                subtype: 'success',
                response: decision,
              }),
            );
            continue;
          }

          if (msg.type === 'result' && !usageRecorded) {
            usageRecorded = true;
            usage = (msg.usage as Record<string, unknown> | undefined) ?? {};
            recordAiApiKeyUsage(
              authenticatedApiKey.id,
              (msg.usage ?? undefined) as AiApiUsage | undefined,
              typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : undefined,
            );
          }

          switch (msg.type as string) {
            case 'assistant_partial': {
              const delta = msg.delta;
              if (typeof delta === 'string' && delta) {
                streamState.sawPartialText = true;
                assistantContent += delta;
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
                assistantContent += delta.text;
                sseWrite(res, 'delta', { content: delta.text });
              } else if (
                delta.type === 'thinking_delta' &&
                typeof delta.thinking === 'string' &&
                delta.thinking
              ) {
                streamState.sawPartialThinking = true;
                const step = { content: delta.thinking, timestamp: Date.now() };
                thinkingSteps.push(step);
                sseWrite(res, 'thinking', step);
              }
              break;
            }

            case 'assistant': {
              const contentBlocks = (msg.message as { content?: unknown[] } | undefined)?.content;
              if (typeof contentBlocks === 'string') {
                if (contentBlocks && !streamState.sawPartialText) {
                  assistantContent += contentBlocks;
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
                  assistantContent += nextBlock.text;
                  sseWrite(res, 'delta', { content: nextBlock.text });
                } else if (
                  nextBlock.type === 'thinking' &&
                  typeof nextBlock.thinking === 'string' &&
                  !streamState.sawPartialThinking
                ) {
                  const step = { content: nextBlock.thinking, timestamp: Date.now() };
                  thinkingSteps.push(step);
                  sseWrite(res, 'thinking', step);
                } else if (nextBlock.type === 'tool_use') {
                  const id = typeof nextBlock.id === 'string' ? nextBlock.id : undefined;
                  const toolCall = {
                    id,
                    name: typeof nextBlock.name === 'string' ? nextBlock.name : 'unknown',
                    input:
                      typeof nextBlock.input === 'object' && nextBlock.input !== null
                        ? (nextBlock.input as Record<string, unknown>)
                        : undefined,
                    status: 'running' as const,
                    timestamp: Date.now(),
                  };
                  const index = toolCalls.push(toolCall) - 1;
                  if (id) {
                    pendingToolUses.set(id, {
                      index,
                      name: toolCall.name,
                      input: toolCall.input ?? {},
                    });
                  }
                  sseWrite(res, 'tool_call', toolCall);
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

              const pendingTool = pendingToolUses.get(id);
              if (pendingTool) {
                const toolCall = toolCalls[pendingTool.index];
                if (toolCall) {
                  toolCall.status = isError ? 'error' : 'completed';
                  toolCall.result = resultText;
                  sseWrite(res, 'tool_call', { ...toolCall });
                }

                if (!isError && WRITE_LIKE_TOOLS.has(pendingTool.name)) {
                  if (isSysmlWriteToolInput(pendingTool.input)) {
                    codeCount += 1;
                  }
                }
              } else {
                sseWrite(res, 'tool_call', {
                  id,
                  name: 'unknown',
                  status: isError ? 'error' : 'completed',
                  result: resultText,
                  timestamp: Date.now(),
                });
              }

              pendingToolUses.delete(id);
              break;
            }

            case 'result': {
              sawResult = true;
              durationMs = typeof msg.duration_ms === 'number' ? msg.duration_ms : undefined;
              model = typeof msg.model === 'string' ? msg.model : model;
              if (Boolean(msg.is_error)) {
                errorText ??= typeof msg.result === 'string' ? msg.result : 'Claude run failed';
              }
              sseWrite(res, 'result', {
                result: msg.result,
                is_error: Boolean(msg.is_error),
                duration_ms: msg.duration_ms,
                total_cost_usd: msg.total_cost_usd,
                usage: msg.usage,
              });
              finalize(ws);
              return;
            }

            case 'assistant_error': {
              errorText ??= typeof msg.message === 'string' ? msg.message : 'Claude error';
              sseWrite(res, 'error', { content: errorText });
              break;
            }

            case 'server_error': {
              errorText ??=
                typeof msg.content === 'string' ? msg.content : 'Claude session server error';
              sseWrite(res, 'error', { content: errorText });
              break;
            }

            case 'server_session_done': {
              const exitCode = Number(msg.exit_code ?? 0);
              if (exitCode !== 0) {
                errorText ??= `agent server session exited with code ${exitCode}`;
                sseWrite(res, 'error', { content: errorText });
              }
              break;
            }

            default:
              break;
          }
        } catch {
          // ignore non-json debug lines
        }
      }
    });

    ws.on('error', async err => {
      if (finished) return;

      if (!sawAnyMessage && !retried) {
        const recreatedContext = await resolveRuntimeContext(
          req.params.projectId,
          req.params.conversationId,
          true,
        );
        void connectAndStream(recreatedContext, true);
        return;
      }

      errorText ??= `WebSocket error: ${err.message}`;
      sseWrite(res, 'error', { content: errorText });
      finalize(ws);
    });

    ws.on('close', async () => {
      if (finished) return;

      if (!sawAnyMessage && !retried) {
        const recreatedContext = await resolveRuntimeContext(
          req.params.projectId,
          req.params.conversationId,
          true,
        );
        void connectAndStream(recreatedContext, true);
        return;
      }

      if (!sawResult) {
        errorText ??= 'Conversation stream closed before completion';
        sseWrite(res, 'error', { content: errorText });
      }
      finalize();
    });
  };

  void connectAndStream(runtime, false);
});