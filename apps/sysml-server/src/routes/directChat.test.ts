import express from 'express';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockSocketPlan = (ws: EventEmitter & {
  readyState: number;
  send: (chunk: string) => void;
  close: () => void;
}) => void;

const globalWithPlans = globalThis as typeof globalThis & {
  __directChatWsPlans__?: MockSocketPlan[];
};

globalWithPlans.__directChatWsPlans__ ??= [];

vi.mock('ws', () => {
  class MockWebSocket extends EventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;

    constructor(_url: string) {
      super();
      const plan = globalWithPlans.__directChatWsPlans__?.shift();
      queueMicrotask(() => {
        if (plan) {
          plan(this as EventEmitter & {
            readyState: number;
            send: (chunk: string) => void;
            close: () => void;
          });
          return;
        }

        this.readyState = MockWebSocket.OPEN;
        this.emit('open');
      });
    }

    send(_chunk: string): void {}

    close(): void {
      if (this.readyState === MockWebSocket.CLOSED) {
        return;
      }
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close');
    }
  }

  return { WebSocket: MockWebSocket };
});

import { directChatRouter, handleFreeCodeMsg } from './directChat.js';

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

function createResponseRecorder() {
  const chunks: string[] = [];
  const res = {
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } as unknown as Response;

  return {
    res,
    readEvents(): SseEvent[] {
      return chunks
        .join('')
        .trim()
        .split('\n\n')
        .filter(Boolean)
        .map(block => {
          const [eventLine, dataLine] = block.split('\n');
          return {
            event: eventLine.replace('event: ', ''),
            data: JSON.parse(dataLine.replace('data: ', '')) as Record<string, unknown>,
          };
        });
    },
  };
}

function readSseEvents(body: string): SseEvent[] {
  return body
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map(block => {
      const [eventLine, dataLine] = block.split('\n');
      return {
        event: eventLine.replace('event: ', ''),
        data: JSON.parse(dataLine.replace('data: ', '')) as Record<string, unknown>,
      };
    });
}

async function startDirectChatServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', directChatRouter);

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
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

describe('handleFreeCodeMsg', () => {
  it('forwards assistant text content blocks as delta events', () => {
    const recorder = createResponseRecorder();
    const pendingToolUses = new Map<string, { name: string; input: Record<string, unknown> }>();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '生成完成' },
            { type: 'thinking', thinking: '分析模型结构' },
            { type: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: 'model.sysml' } },
          ],
        },
      },
      pendingToolUses,
      true,
    );

    expect(recorder.readEvents()).toEqual([
      { event: 'delta', data: { content: '生成完成' } },
      { event: 'thinking', data: { content: '分析模型结构' } },
      {
        event: 'tool_call',
        data: {
          id: 'tool-1',
          name: 'Write',
          input: { file_path: 'model.sysml' },
          status: 'running',
        },
      },
    ]);
    expect(pendingToolUses.get('tool-1')).toEqual({
      name: 'Write',
      input: { file_path: 'model.sysml' },
    });
  });

  it('forwards assistant string content as a delta event', () => {
    const recorder = createResponseRecorder();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'assistant',
        message: {
          content: '纯文本回复',
        },
      },
      new Map(),
      true,
    );

    expect(recorder.readEvents()).toEqual([
      { event: 'delta', data: { content: '纯文本回复' } },
    ]);
  });

  it('forwards assistant partial messages as delta events', () => {
    const recorder = createResponseRecorder();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'assistant_partial',
        delta: 'partial token',
      },
      new Map(),
      true,
    );

    expect(recorder.readEvents()).toEqual([
      { event: 'delta', data: { content: 'partial token' } },
    ]);
  });

  it('forwards stream_event text deltas as delta events', () => {
    const recorder = createResponseRecorder();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: 'streamed token',
          },
        },
      },
      new Map(),
      true,
    );

    expect(recorder.readEvents()).toEqual([
      { event: 'delta', data: { content: 'streamed token' } },
    ]);
  });

  it('does not duplicate the final assistant text after partial text streaming', () => {
    const recorder = createResponseRecorder();
    const streamState = {
      sawPartialText: false,
      sawPartialThinking: false,
    };

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: 'partial text',
          },
        },
      },
      new Map(),
      true,
      streamState,
    );

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'partial text' }],
        },
      },
      new Map(),
      true,
      streamState,
    );

    expect(recorder.readEvents()).toEqual([
      { event: 'delta', data: { content: 'partial text' } },
    ]);
  });

  it('emits code events when a Write tool stores a SysML file', () => {
    const recorder = createResponseRecorder();
    const pendingToolUses = new Map<string, { name: string; input: Record<string, unknown> }>([
      [
        'tool-2',
        {
          name: 'Write',
          input: {
            file_path: 'models/drone.sysml',
            content: 'package DroneSystem {}',
          },
        },
      ],
    ]);

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'tool_result',
        tool_use_id: 'tool-2',
        is_error: false,
        content: [{ text: 'saved' }],
      },
      pendingToolUses,
      true,
    );

    expect(recorder.readEvents()).toEqual([
      {
        event: 'code',
        data: {
          content: 'package DroneSystem {}',
          language: 'sysml',
          autoApply: true,
          filePath: 'models/drone.sysml',
        },
      },
      {
        event: 'tool_call',
        data: {
          id: 'tool-2',
          status: 'completed',
          result: 'saved',
        },
      },
    ]);
    expect(pendingToolUses.has('tool-2')).toBe(false);
  });

  it('surfaces server-side session errors to the SSE stream', () => {
    const recorder = createResponseRecorder();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'server_error',
        content: 'Error: Expected message role user',
      },
      new Map(),
      true,
    );

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'server_session_done',
        exit_code: 1,
      },
      new Map(),
      true,
    );

    expect(recorder.readEvents()).toEqual([
      {
        event: 'error',
        data: { content: 'Error: Expected message role user' },
      },
      {
        event: 'error',
        data: { content: 'free-code session exited with code 1' },
      },
    ]);
  });
});

describe('directChatRouter', () => {
  const realFetch = globalThis.fetch;
  const realFreeCodeUrl = process.env.FREE_CODE_SERVER_URL;
  let server: Awaited<ReturnType<typeof startDirectChatServer>> | undefined;

  beforeEach(async () => {
    globalWithPlans.__directChatWsPlans__ = [];
    process.env.FREE_CODE_SERVER_URL = 'http://fake-free-code';
    server = await startDirectChatServer();
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    if (realFreeCodeUrl === undefined) {
      delete process.env.FREE_CODE_SERVER_URL;
    } else {
      process.env.FREE_CODE_SERVER_URL = realFreeCodeUrl;
    }
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it('recreates a stale free-code session on the next turn of the same conversation', async () => {
    const createdSessions = [
      {
        session_id: 'session-1',
        ws_url: 'ws://fake-free-code/sessions/session-1/ws',
      },
      {
        session_id: 'session-2',
        ws_url: 'ws://fake-free-code/sessions/session-2/ws',
      },
    ];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('http://fake-free-code/')) {
        const next = createdSessions.shift();
        if (!next) {
          throw new Error('Unexpected extra free-code session creation');
        }
        return new Response(JSON.stringify(next), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    globalWithPlans.__directChatWsPlans__!.push(ws => {
      ws.readyState = 1;
      ws.emit('open');
      queueMicrotask(() => {
        ws.emit(
          'message',
          Buffer.from(JSON.stringify({ type: 'result', result: 'first ok' }) + '\n'),
        );
      });
    });

    globalWithPlans.__directChatWsPlans__!.push(ws => {
      ws.readyState = 3;
      ws.emit('close');
    });

    globalWithPlans.__directChatWsPlans__!.push(ws => {
      ws.readyState = 1;
      ws.emit('open');
      queueMicrotask(() => {
        ws.emit(
          'message',
          Buffer.from(JSON.stringify({ type: 'result', result: 'second ok' }) + '\n'),
        );
      });
    });

    const firstResponse = await fetch(`${server!.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'conv-1',
        messages: [{ role: 'user', content: 'first question' }],
      }),
    });
    const firstEvents = readSseEvents(await firstResponse.text());

    const secondResponse = await fetch(`${server!.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'conv-1',
        messages: [{ role: 'user', content: 'second question' }],
      }),
    });
    const secondEvents = readSseEvents(await secondResponse.text());

    expect(firstEvents).toEqual([
      { event: 'session', data: { conversationId: 'conv-1' } },
      {
        event: 'result',
        data: {
          result: 'first ok',
          is_error: false,
          duration_ms: undefined,
          total_cost_usd: undefined,
        },
      },
      { event: 'done', data: {} },
    ]);

    expect(secondEvents).toEqual([
      { event: 'session', data: { conversationId: 'conv-1' } },
      {
        event: 'result',
        data: {
          result: 'second ok',
          is_error: false,
          duration_ms: undefined,
          total_cost_usd: undefined,
        },
      },
      { event: 'done', data: {} },
    ]);

    expect(createdSessions).toHaveLength(0);
  });
});