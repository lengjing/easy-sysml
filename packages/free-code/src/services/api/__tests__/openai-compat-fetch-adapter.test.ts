/**
 * Tests for packages/free-code/src/services/api/openai-compat-fetch-adapter.ts
 *
 * These tests verify:
 *  - OPENAI_COMPAT_PROVIDERS presets
 *  - mapModelName() via createOpenAICompatFetch
 *  - getOpenAICompatFetch() env-based activation
 *  - createOpenAICompatFetch() — passes non-/messages URLs through
 *  - Message translation (Anthropic → OpenAI Chat Completions format)
 *  - Tool translation
 *  - Stream translation (OpenAI SSE → Anthropic SSE) for text content
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getOpenAICompatFetch,
  createOpenAICompatFetch,
} from '../openai-compat-fetch-adapter.ts';
import { OPENAI_COMPAT_PROVIDERS } from '../../../utils/model/openaiCompat.js';

function asFetch(
  fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return Object.assign(fn, {
    preconnect: globalThis.fetch.preconnect?.bind(globalThis.fetch),
  }) as typeof fetch;
}

/* ------------------------------------------------------------------ */
/*  OPENAI_COMPAT_PROVIDERS                                           */
/* ------------------------------------------------------------------ */

describe('OPENAI_COMPAT_PROVIDERS', () => {
  it('has deepseek preset', () => {
    expect(OPENAI_COMPAT_PROVIDERS.deepseek).toBeDefined();
    expect(OPENAI_COMPAT_PROVIDERS.deepseek.baseUrl).toContain('deepseek.com');
    expect(OPENAI_COMPAT_PROVIDERS.deepseek.defaultModel).toBeTruthy();
    expect(OPENAI_COMPAT_PROVIDERS.deepseek.label).toBe('DeepSeek');
  });

  it('has qwen preset', () => {
    expect(OPENAI_COMPAT_PROVIDERS.qwen).toBeDefined();
    expect(OPENAI_COMPAT_PROVIDERS.qwen.baseUrl).toContain('dashscope.aliyuncs.com');
    expect(OPENAI_COMPAT_PROVIDERS.qwen.defaultModel).toBeTruthy();
    expect(OPENAI_COMPAT_PROVIDERS.qwen.label).toBe('Qwen (Alibaba Cloud)');
  });
});

/* ------------------------------------------------------------------ */
/*  getOpenAICompatFetch                                              */
/* ------------------------------------------------------------------ */

describe('getOpenAICompatFetch()', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_USE_OPENAI_COMPAT;
    delete process.env.OPENAI_COMPAT_BASE_URL;
    delete process.env.OPENAI_COMPAT_API_KEY;
    delete process.env.OPENAI_COMPAT_PROVIDER;
  });

  it('returns null when CLAUDE_CODE_USE_OPENAI_COMPAT is not set', () => {
    delete process.env.CLAUDE_CODE_USE_OPENAI_COMPAT;
    expect(getOpenAICompatFetch()).toBeNull();
  });

  it('returns null when CLAUDE_CODE_USE_OPENAI_COMPAT=0', () => {
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT = '0';
    expect(getOpenAICompatFetch()).toBeNull();
  });

  it('returns null when keys are missing (warns)', () => {
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT = '1';
    // No base URL or API key set
    delete process.env.OPENAI_COMPAT_BASE_URL;
    delete process.env.OPENAI_COMPAT_API_KEY;
    expect(getOpenAICompatFetch()).toBeNull();
  });

  it('returns a fetch function when fully configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT = '1';
    process.env.OPENAI_COMPAT_BASE_URL = 'https://api.deepseek.com/v1';
    process.env.OPENAI_COMPAT_API_KEY = 'sk-test';
    const fn = getOpenAICompatFetch();
    expect(typeof fn).toBe('function');
  });

  it('returns a fetch function when CLAUDE_CODE_USE_OPENAI_COMPAT=true', () => {
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT = 'true';
    process.env.OPENAI_COMPAT_BASE_URL = 'https://api.example.com/v1';
    process.env.OPENAI_COMPAT_API_KEY = 'sk-test';
    const fn = getOpenAICompatFetch();
    expect(typeof fn).toBe('function');
  });

  it('returns a fetch function when preset provider is configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT = '1';
    process.env.OPENAI_COMPAT_PROVIDER = 'deepseek';
    process.env.OPENAI_COMPAT_API_KEY = 'sk-test';
    const fn = getOpenAICompatFetch();
    expect(typeof fn).toBe('function');
  });
});

/* ------------------------------------------------------------------ */
/*  createOpenAICompatFetch — URL routing                             */
/* ------------------------------------------------------------------ */

describe('createOpenAICompatFetch() — URL routing', () => {
  it('passes through requests that do not include /messages', async () => {
    const mockFetch = globalThis.fetch;
    let capturedUrl: string | undefined;
    globalThis.fetch = asFetch(async (input: RequestInfo | URL, _init?: RequestInit) => {
      capturedUrl = input instanceof Request ? input.url : String(input);
      return new Response('{}', { status: 200 });
    });

    try {
      const adapter = createOpenAICompatFetch('https://api.example.com', 'sk-test');
      await adapter('https://api.example.com/other-endpoint', {});
      expect(capturedUrl).toBe('https://api.example.com/other-endpoint');
    } finally {
      globalThis.fetch = mockFetch;
    }
  });

  it('routes /messages requests to /chat/completions', async () => {
    let capturedUrl: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;

    const mockFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input instanceof Request ? input.url : String(input);
      capturedBody = JSON.parse(init?.body as string ?? '{}');
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    try {
      const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
      const body = JSON.stringify({
        model: 'claude-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });
      await adapter('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body,
      });

      expect(capturedUrl).toBe('https://api.example.com/v1/chat/completions');
      expect(capturedBody).toBeDefined();
      expect(capturedBody?.stream).toBe(true);
      expect(capturedBody?.messages).toBeDefined();
    } finally {
      globalThis.fetch = mockFetch;
    }
  });

  it('preserves non-streaming requests for SDK create() callers', async () => {
    let capturedBody: Record<string, unknown> | undefined;

    const mockFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? '{}');
      return new Response(
        JSON.stringify({
          id: 'chatcmpl_123',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'Hello from compat',
              },
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 4,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    try {
      const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
      const response = await adapter('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(capturedBody?.stream).toBe(false);
      expect(response.headers.get('content-type')).toContain('application/json');

      const responseBody = await response.json() as Record<string, unknown>;
      expect(responseBody.type).toBe('message');
      expect(responseBody.model).toBe('deepseek-v4-flash');
      expect(responseBody.stop_reason).toBe('end_turn');
      expect((responseBody.content as Array<Record<string, unknown>>)[0]?.text).toBe('Hello from compat');
      expect((responseBody.usage as Record<string, unknown>).input_tokens).toBe(12);
      expect((responseBody.usage as Record<string, unknown>).output_tokens).toBe(4);
    } finally {
      globalThis.fetch = mockFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Message translation                                               */
/* ------------------------------------------------------------------ */

describe('Message translation via createOpenAICompatFetch', () => {
  let capturedBody: Record<string, unknown> | undefined;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    capturedBody = undefined;
    originalFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? '{}');
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('includes system prompt as system message', async () => {
    const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
    await adapter('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet',
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    const messages = capturedBody?.messages as Array<Record<string, unknown>>;
    const sysMsg = messages.find(m => m.role === 'system');
    expect(sysMsg).toBeDefined();
    expect(sysMsg?.content).toContain('helpful assistant');
  });

  it('translates simple user message', async () => {
    const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
    await adapter('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });

    const messages = capturedBody?.messages as Array<Record<string, unknown>>;
    const userMsg = messages.find(m => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toBe('Hello');
  });

  it('translates tool definitions to OpenAI function format', async () => {
    const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
    await adapter('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet',
        messages: [{ role: 'user', content: 'Use a tool' }],
        tools: [
          {
            name: 'my_tool',
            description: 'A test tool',
            input_schema: {
              type: 'object',
              properties: { input: { type: 'string' } },
              required: ['input'],
            },
          },
        ],
      }),
    });

    const tools = capturedBody?.tools as Array<Record<string, unknown>>;
    expect(tools).toBeDefined();
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe('function');
    const fn = tools[0].function as Record<string, unknown>;
    expect(fn.name).toBe('my_tool');
    expect(fn.description).toBe('A test tool');
  });

  it('translates tool_use (assistant) message correctly', async () => {
    const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
    await adapter('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet',
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'I will use a tool.' },
              { type: 'tool_use', id: 'call_123', name: 'my_tool', input: { input: 'value' } },
            ],
          },
        ],
      }),
    });

    const messages = capturedBody?.messages as Array<Record<string, unknown>>;
    const assistantMsg = messages.find(m => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.tool_calls).toBeDefined();
    const toolCall = (assistantMsg?.tool_calls as Array<Record<string, unknown>>)[0];
    expect(toolCall.id).toBe('call_123');
    expect((toolCall.function as Record<string, unknown>).name).toBe('my_tool');
  });

  it('preserves assistant thinking blocks as reasoning_content', async () => {
    const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
    await adapter('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet',
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'step by step' },
              { type: 'text', text: 'final answer' },
            ],
          },
        ],
      }),
    });

    const messages = capturedBody?.messages as Array<Record<string, unknown>>;
    const assistantMsg = messages.find(m => m.role === 'assistant');
    expect(assistantMsg?.content).toBe('final answer');
    expect(assistantMsg?.reasoning_content).toBe('step by step');
  });

  it('translates tool_result (user) message to tool role', async () => {
    const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
    await adapter('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'call_123', content: 'Tool result text' },
            ],
          },
        ],
      }),
    });

    const messages = capturedBody?.messages as Array<Record<string, unknown>>;
    const toolMsg = messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.tool_call_id).toBe('call_123');
    expect(toolMsg?.content).toBe('Tool result text');
  });

  it('handles array system prompt', async () => {
    const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
    await adapter('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet',
        system: [
          { type: 'text', text: 'First instruction.' },
          { type: 'text', text: 'Second instruction.' },
        ],
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    const messages = capturedBody?.messages as Array<Record<string, unknown>>;
    const sysMsg = messages.find(m => m.role === 'system');
    expect(sysMsg?.content).toContain('First instruction');
    expect(sysMsg?.content).toContain('Second instruction');
  });
});

/* ------------------------------------------------------------------ */
/*  Model name mapping                                                 */
/* ------------------------------------------------------------------ */

describe('Model name mapping', () => {
  afterEach(() => {
    delete process.env.OPENAI_COMPAT_MODEL;
  });

  it('respects OPENAI_COMPAT_MODEL override', async () => {
    process.env.OPENAI_COMPAT_MODEL = 'qwen-turbo';
    let capturedBody: Record<string, unknown> | undefined;

    const mockFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (_: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? '{}');
      const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close(); } });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });

    try {
      const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
      await adapter('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'claude-sonnet', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(capturedBody?.model).toBe('qwen-turbo');
    } finally {
      globalThis.fetch = mockFetch;
    }
  });

  it('passes through non-claude models unchanged', async () => {
    delete process.env.OPENAI_COMPAT_MODEL;
    let capturedBody: Record<string, unknown> | undefined;

    const mockFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (_: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? '{}');
      const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close(); } });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });

    try {
      const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
      await adapter('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(capturedBody?.model).toBe('deepseek-chat');
    } finally {
      globalThis.fetch = mockFetch;
    }
  });

  it('uses preset default model when OPENAI_COMPAT_PROVIDER is set', async () => {
    process.env.OPENAI_COMPAT_PROVIDER = 'qwen';

    let capturedBody: Record<string, unknown> | undefined;
    const mockFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'hi' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    try {
      const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
      await adapter('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 32,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      });

      expect(capturedBody?.model).toBe('qwen-plus');
    } finally {
      delete process.env.OPENAI_COMPAT_PROVIDER;
      globalThis.fetch = mockFetch;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling                                                     */
/* ------------------------------------------------------------------ */

describe('Error handling', () => {
  it('returns error response when upstream returns 4xx', async () => {
    const mockFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('{"error": "Unauthorized"}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    });

    try {
      const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-bad-key');
      const response = await adapter('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'claude-sonnet', messages: [{ role: 'user', content: 'hi' }] }),
      });
      expect(response.status).toBe(401);
      const body = await response.json() as { error?: Record<string, unknown> };
      expect(body.error).toBeDefined();
      expect(typeof (body.error as Record<string, unknown>).message).toBe('string');
    } finally {
      globalThis.fetch = mockFetch;
    }
  });
});

describe('Streaming reasoning translation', () => {
  it('opens separate thinking and text blocks for reasoning_content streams', async () => {
    const mockFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode('data: {"choices":[{"delta":{"reasoning_content":"step 1"}}]}\n\n'));
          controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'));
          controller.enqueue(enc.encode('data: {"choices":[{"finish_reason":"stop"}]}\n\n'));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    try {
      const adapter = createOpenAICompatFetch('https://api.example.com/v1', 'sk-test');
      const response = await adapter('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-sonnet',
          stream: true,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      });

      const sse = await response.text();
      expect(sse).toContain('"content_block":{"type":"thinking","thinking":""}');
      expect(sse).toContain('"delta":{"type":"thinking_delta","thinking":"step 1"}');
      expect(sse).toContain('"content_block":{"type":"text","text":""}');
      expect(sse).toContain('"delta":{"type":"text_delta","text":"ok"}');
      expect(sse).toContain('"index":0');
      expect(sse).toContain('"index":1');
    } finally {
      globalThis.fetch = mockFetch;
    }
  });
});
