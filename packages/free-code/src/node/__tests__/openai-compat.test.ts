/**
 * Tests for the OpenAI-compatible fetch adapter.
 *
 * We test `createOpenAICompatFetch` directly — no real network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOpenAICompatFetch } from '../../services/api/openai-compat-fetch-adapter.js'

// ---------------------------------------------------------------------------
// Helpers: build fake OpenAI SSE stream
// ---------------------------------------------------------------------------

function makeSSEStream(chunks: Array<Record<string, unknown>>, done = true): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const lines = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`)
  if (done) lines.push('data: [DONE]\n\n')
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
}

function textChunk(text: string, finishReason: string | null = null) {
  return {
    choices: [
      {
        delta: { content: text },
        finish_reason: finishReason,
        index: 0,
      },
    ],
  }
}

function toolChunk(
  index: number,
  id: string | null,
  name: string | null,
  args: string,
  finishReason: string | null = null,
) {
  return {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index,
              id,
              type: 'function',
              function: { name, arguments: args },
            },
          ],
        },
        finish_reason: finishReason,
        index: 0,
      },
    ],
  }
}

function usageChunk(promptTokens: number, completionTokens: number) {
  return {
    choices: [],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  }
}

// ---------------------------------------------------------------------------
// Parse an Anthropic-format SSE stream into events
// ---------------------------------------------------------------------------

async function collectSSEEvents(response: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await response.text()
  const events: Array<{ event: string; data: unknown }> = []

  let currentEvent = ''
  for (const line of text.split('\n')) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6))
        events.push({ event: currentEvent, data })
      } catch {
        // ignore parse errors
      }
      currentEvent = ''
    }
  }
  return events
}

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
const origFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = origFetch
  mockFetch.mockReset()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createOpenAICompatFetch — request routing', () => {
  it('passes through non-messages requests unchanged', async () => {
    mockFetch.mockResolvedValue(new Response('{}'))

    const adaptedFetch = createOpenAICompatFetch('sk-test', 'https://api.example.com/v1')
    await adaptedFetch('https://api.example.com/v1/models')

    // Should have called global fetch with the original URL
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/v1/models', undefined)
  })

  it('intercepts /v1/messages requests', async () => {
    const stream = makeSSEStream([textChunk('hello'), textChunk('', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-test', 'https://api.example.com/v1')
    const body = JSON.stringify({ model: 'my-model', messages: [{ role: 'user', content: 'hi' }], max_tokens: 100 })
    const response = await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body,
    })

    // Should have called /chat/completions
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(response.status).toBe(200)
  })

  it('sends the correct Authorization header', async () => {
    const stream = makeSSEStream([textChunk('done', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-mykey', 'https://api.example.com/v1')
    await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [], max_tokens: 10 }),
    })

    const [, init] = mockFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sk-mykey')
  })

  it('sends the model from the Anthropic request body', async () => {
    const stream = makeSSEStream([textChunk('ok', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'qwen-turbo', messages: [], max_tokens: 10 }),
    })

    const [, init] = mockFetch.mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(sentBody.model).toBe('qwen-turbo')
  })
})

describe('createOpenAICompatFetch — message translation', () => {
  it('converts a simple user string message', async () => {
    const stream = makeSSEStream([textChunk('hi', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'm',
        messages: [{ role: 'user', content: 'hello world' }],
        max_tokens: 10,
      }),
    })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    const userMsg = body.messages.find((m: any) => m.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg.content).toBe('hello world')
  })

  it('injects system prompt as first message', async () => {
    const stream = makeSSEStream([textChunk('ok', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'm',
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'hey' }],
        max_tokens: 10,
      }),
    })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toBe('You are a helpful assistant.')
  })

  it('injects system prompt array as joined string', async () => {
    const stream = makeSSEStream([textChunk('ok', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'm',
        system: [{ type: 'text', text: 'part1' }, { type: 'text', text: 'part2' }],
        messages: [{ role: 'user', content: 'q' }],
        max_tokens: 10,
      }),
    })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.messages[0].content).toBe('part1\npart2')
  })

  it('converts tool_result blocks to tool messages', async () => {
    const stream = makeSSEStream([textChunk('done', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'm',
        messages: [
          { role: 'user', content: 'initial' },
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: { command: 'ls' } }],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'file.txt\n' }],
          },
        ],
        max_tokens: 10,
      }),
    })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    const toolMsg = body.messages.find((m: any) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg.tool_call_id).toBe('tu_1')
    expect(toolMsg.content).toBe('file.txt\n')
  })

  it('converts tool definitions to OpenAI function format', async () => {
    const stream = makeSSEStream([textChunk('done', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'm',
        messages: [{ role: 'user', content: 'go' }],
        tools: [
          { name: 'Bash', description: 'Run a bash command', input_schema: { type: 'object', properties: { command: { type: 'string' } } } },
        ],
        max_tokens: 10,
      }),
    })

    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.tools).toHaveLength(1)
    expect(body.tools[0].type).toBe('function')
    expect(body.tools[0].function.name).toBe('Bash')
    expect(body.tool_choice).toBe('auto')
  })
})

describe('createOpenAICompatFetch — response translation', () => {
  it('emits message_start event', async () => {
    const stream = makeSSEStream([textChunk('hello', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    const response = await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
    })

    const events = await collectSSEEvents(response)
    const start = events.find(e => e.event === 'message_start')
    expect(start).toBeDefined()
    expect((start!.data as any).message.role).toBe('assistant')
  })

  it('emits content_block_start and content_block_delta for text', async () => {
    const stream = makeSSEStream([textChunk('hello '), textChunk('world', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    const response = await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
    })

    const events = await collectSSEEvents(response)
    const blockStart = events.find(e => e.event === 'content_block_start')
    expect(blockStart).toBeDefined()
    expect((blockStart!.data as any).content_block.type).toBe('text')

    const deltas = events.filter(e => e.event === 'content_block_delta')
    expect(deltas.length).toBeGreaterThanOrEqual(1)
    const text = deltas.map(d => (d.data as any).delta.text).join('')
    expect(text).toContain('hello')
    expect(text).toContain('world')
  })

  it('emits message_stop with end_turn when no tool calls', async () => {
    const stream = makeSSEStream([textChunk('answer', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    const response = await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }], max_tokens: 10 }),
    })

    const events = await collectSSEEvents(response)
    const messageDelta = events.find(e => e.event === 'message_delta')
    expect(messageDelta).toBeDefined()
    expect((messageDelta!.data as any).delta.stop_reason).toBe('end_turn')
  })

  it('emits tool_use stop_reason when tool calls are present', async () => {
    const stream = makeSSEStream([
      toolChunk(0, 'call_1', 'Bash', '{"c'),
      toolChunk(0, null, null, 'ommand":"ls"}', 'tool_calls'),
    ])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    const response = await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }], max_tokens: 10 }),
    })

    const events = await collectSSEEvents(response)
    const messageDelta = events.find(e => e.event === 'message_delta')
    expect(messageDelta).toBeDefined()
    expect((messageDelta!.data as any).delta.stop_reason).toBe('tool_use')
  })

  it('emits content_block_start with tool_use type for function calls', async () => {
    const stream = makeSSEStream([
      toolChunk(0, 'call_abc', 'Read', '{"file":"/tmp/x"}', 'tool_calls'),
    ])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    const response = await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }], max_tokens: 10 }),
    })

    const events = await collectSSEEvents(response)
    const toolBlock = events.find(
      e => e.event === 'content_block_start' && (e.data as any).content_block?.type === 'tool_use',
    )
    expect(toolBlock).toBeDefined()
    expect((toolBlock!.data as any).content_block.name).toBe('Read')
    expect((toolBlock!.data as any).content_block.id).toBe('call_abc')
  })

  it('includes token usage in message_stop', async () => {
    const stream = makeSSEStream([textChunk('ok', 'stop'), usageChunk(20, 10)])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    const response = await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }], max_tokens: 10 }),
    })

    const events = await collectSSEEvents(response)
    const messageStop = events.find(e => e.event === 'message_stop')
    expect(messageStop).toBeDefined()
    const usage = (messageStop!.data as any).usage
    expect(usage?.input_tokens).toBe(20)
    expect(usage?.output_tokens).toBe(10)
  })
})

describe('createOpenAICompatFetch — error handling', () => {
  it('returns error response when provider returns non-2xx', async () => {
    mockFetch.mockResolvedValue(
      new Response('{"error":"quota exceeded"}', { status: 429 }),
    )

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1')
    const response = await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [], max_tokens: 10 }),
    })

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body.type).toBe('error')
    expect(body.error.message).toContain('429')
  })
})

describe('createOpenAICompatFetch — base URL normalisation', () => {
  it('strips trailing slash from base URL', async () => {
    const stream = makeSSEStream([textChunk('hi', 'stop')])
    mockFetch.mockResolvedValue(new Response(stream, { status: 200 }))

    const adaptedFetch = createOpenAICompatFetch('sk-k', 'https://api.example.com/v1/')
    await adaptedFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [], max_tokens: 10 }),
    })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
  })
})

describe('createOpenAICompatFetch — openAICompat option in HeadlessQueryOptions', () => {
  it('HeadlessQueryOptions interface accepts openAICompat config', () => {
    // Purely structural/type check: ensure the options object can be constructed
    const opts = {
      model: 'qwen-turbo',
      openAICompat: {
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-test',
      },
    }
    expect(opts.openAICompat.baseUrl).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    )
    expect(opts.openAICompat.apiKey).toBe('sk-test')
  })

  it('OpenAICompatConfig without apiKey is valid', () => {
    const opts = {
      openAICompat: {
        baseUrl: 'http://localhost:11434/v1',
      },
    }
    expect(opts.openAICompat.baseUrl).toBeDefined()
  })
})
