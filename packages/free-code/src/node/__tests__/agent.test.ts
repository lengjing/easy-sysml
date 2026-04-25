/**
 * Tests for FreeCodeAgent and createAgent.
 *
 * These tests mock the Anthropic SDK so they run without an API key.
 * Also tests provider selection and new capabilities (tool names, initialMessages).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FreeCodeAgent, createAgent } from '../agent.js'
import type { FreeCodeOptions, ToolDefinition } from '../types.js'

// ---------------------------------------------------------------------------
// Mock Anthropic SDK (default provider)
// ---------------------------------------------------------------------------

let mockCreate: ReturnType<typeof vi.fn>

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  }))
  return { default: MockAnthropic }
})

function makeTextResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }
}

function makeToolUseResponse(toolName: string, toolId: string, input: Record<string, unknown>) {
  return {
    content: [{ type: 'tool_use', id: toolId, name: toolName, input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 20, output_tokens: 15, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }
}

function clearProviderEnv() {
  for (const k of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_OPENAI']) {
    delete process.env[k]
  }
}

// ---------------------------------------------------------------------------
// createAgent tests
// ---------------------------------------------------------------------------

describe('createAgent', () => {
  afterEach(clearProviderEnv)

  it('returns a FreeCodeAgent instance', () => {
    const agent = createAgent({ apiKey: 'test-key' })
    expect(agent).toBeInstanceOf(FreeCodeAgent)
  })

  it('defaults to firstParty provider', () => {
    const agent = createAgent()
    expect(agent.provider).toBe('firstParty')
  })

  it('uses bedrock when CLAUDE_CODE_USE_BEDROCK=1', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    const agent = createAgent()
    expect(agent.provider).toBe('bedrock')
  })

  it('uses vertex when CLAUDE_CODE_USE_VERTEX=1', () => {
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    const agent = createAgent()
    expect(agent.provider).toBe('vertex')
  })

  it('uses foundry when CLAUDE_CODE_USE_FOUNDRY=1', () => {
    process.env.CLAUDE_CODE_USE_FOUNDRY = '1'
    const agent = createAgent()
    expect(agent.provider).toBe('foundry')
  })

  it('uses openai when CLAUDE_CODE_USE_OPENAI=1', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    const agent = createAgent()
    expect(agent.provider).toBe('openai')
  })
})

// ---------------------------------------------------------------------------
// FreeCodeAgent
// ---------------------------------------------------------------------------

describe('FreeCodeAgent', () => {
  beforeEach(() => {
    mockCreate = vi.fn()
    clearProviderEnv()
  })
  afterEach(clearProviderEnv)

  describe('built-in tools', () => {
    it('has all built-in tools registered', () => {
      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const names = agent.getToolNames()
      expect(names).toContain('Bash')
      expect(names).toContain('Read')
      expect(names).toContain('Write')
      expect(names).toContain('Edit')
      expect(names).toContain('ListDir')
      expect(names).toContain('Glob')
      expect(names).toContain('Grep')
      expect(names).toContain('WebFetch')
      expect(names).toContain('TodoRead')
      expect(names).toContain('TodoWrite')
    })
  })

  describe('query (streaming)', () => {
    it('yields text message and done for simple response', async () => {
      mockCreate.mockResolvedValueOnce(makeTextResponse('Hello!'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const messages = []
      for await (const msg of agent.query('Say hello')) {
        messages.push(msg)
      }

      const textMsgs = messages.filter(m => m.type === 'text')
      const doneMsgs = messages.filter(m => m.type === 'done')
      expect(textMsgs).toHaveLength(1)
      expect((textMsgs[0] as { type: 'text'; text: string }).text).toBe('Hello!')
      expect(doneMsgs).toHaveLength(1)
      expect((doneMsgs[0] as { type: 'done'; result: string }).result).toBe('Hello!')
    })

    it('yields usage message each turn', async () => {
      mockCreate.mockResolvedValueOnce(makeTextResponse('response'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const messages = []
      for await (const msg of agent.query('prompt')) {
        messages.push(msg)
      }

      const usageMsgs = messages.filter(m => m.type === 'usage')
      expect(usageMsgs.length).toBeGreaterThanOrEqual(1)
    })

    it('calls tool and continues loop', async () => {
      let callCount = 0
      mockCreate.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return makeToolUseResponse('Bash', 'tool-1', { command: 'echo hi' })
        }
        return makeTextResponse('done after tool')
      })

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const messages = []
      for await (const msg of agent.query('run bash')) {
        messages.push(msg)
      }

      const toolCalls = messages.filter(m => m.type === 'tool_call')
      const toolResults = messages.filter(m => m.type === 'tool_result')
      const doneMsgs = messages.filter(m => m.type === 'done')

      expect(toolCalls).toHaveLength(1)
      expect(toolResults).toHaveLength(1)
      expect(doneMsgs).toHaveLength(1)
      expect(callCount).toBe(2)
    })

    it('yields error message for unknown tool', async () => {
      mockCreate.mockResolvedValueOnce(
        makeToolUseResponse('unknown_tool', 'tool-x', {}),
      )
      mockCreate.mockResolvedValueOnce(makeTextResponse('ok'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const messages = []
      for await (const msg of agent.query('prompt')) {
        messages.push(msg)
      }

      const toolResults = messages.filter(m => m.type === 'tool_result')
      expect(toolResults.length).toBeGreaterThanOrEqual(1)
      const errorResult = toolResults.find(
        m => (m as { type: 'tool_result'; isError: boolean }).isError,
      )
      expect(errorResult).toBeDefined()
    })

    it('stops at maxTurns and yields error', async () => {
      mockCreate.mockImplementation(async () =>
        makeToolUseResponse('Bash', 'tid', { command: 'echo loop' }),
      )

      const agent = new FreeCodeAgent({ apiKey: 'test', maxTurns: 2 })
      const messages = []
      for await (const msg of agent.query('run forever')) {
        messages.push(msg)
      }

      const errorMsgs = messages.filter(m => m.type === 'error')
      expect(errorMsgs.length).toBeGreaterThanOrEqual(1)
    })

    it('yields error on API failure', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API unreachable'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const messages = []
      for await (const msg of agent.query('prompt')) {
        messages.push(msg)
      }

      const errorMsgs = messages.filter(m => m.type === 'error')
      expect(errorMsgs.length).toBeGreaterThanOrEqual(1)
      expect((errorMsgs[0] as { type: 'error'; message: string }).message).toContain('API unreachable')
    })

    it('supports initialMessages for conversation history', async () => {
      mockCreate.mockResolvedValueOnce(makeTextResponse('Got context'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const messages = []
      for await (const msg of agent.query('follow up', {
        initialMessages: [
          { role: 'user', content: 'context from before' },
          { role: 'assistant', content: 'understood' },
        ],
      })) {
        messages.push(msg)
      }

      // Verify create was called with the history + new prompt
      const callArgs = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string }> }
      expect(callArgs.messages.length).toBeGreaterThanOrEqual(3)
      expect(callArgs.messages[0].role).toBe('user')
    })
  })

  describe('runQuery (non-streaming)', () => {
    it('returns result string from done message', async () => {
      mockCreate.mockResolvedValueOnce(makeTextResponse('Final answer'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const result = await agent.runQuery('question')
      expect(result.result).toBe('Final answer')
      expect(result.turnCount).toBe(1)
    })

    it('includes usage data in result', async () => {
      mockCreate.mockResolvedValueOnce(makeTextResponse('ok'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const result = await agent.runQuery('prompt')
      expect(result.usage.inputTokens).toBe(10)
      expect(result.usage.outputTokens).toBe(5)
      expect(typeof result.usage.costUSD).toBe('number')
    })

    it('throws on API error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Rate limit'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      await expect(agent.runQuery('prompt')).rejects.toThrow('Rate limit')
    })
  })

  describe('registerTool / removeTool / getToolNames', () => {
    it('registers a custom tool that gets called', async () => {
      const executeFn = vi.fn().mockResolvedValue({ output: 'custom-output', isError: false })
      const customTool: ToolDefinition = {
        name: 'custom',
        description: 'A custom tool',
        inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
        execute: executeFn,
      }

      mockCreate.mockResolvedValueOnce(
        makeToolUseResponse('custom', 'ct-1', { x: 'hello' }),
      )
      mockCreate.mockResolvedValueOnce(makeTextResponse('done'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      agent.registerTool(customTool)

      const messages = []
      for await (const msg of agent.query('use custom')) {
        messages.push(msg)
      }

      expect(executeFn).toHaveBeenCalledOnce()
      const toolResult = messages.find(m => m.type === 'tool_result')
      expect((toolResult as { output: string } | undefined)?.output).toBe('custom-output')
    })

    it('removes a built-in tool so it is treated as unknown', async () => {
      mockCreate.mockResolvedValueOnce(
        makeToolUseResponse('Bash', 'b-1', { command: 'echo hi' }),
      )
      mockCreate.mockResolvedValueOnce(makeTextResponse('done'))

      const agent = new FreeCodeAgent({ apiKey: 'test' })
      agent.removeTool('Bash')

      const messages = []
      for await (const msg of agent.query('run bash')) {
        messages.push(msg)
      }

      const toolResult = messages.find(m => m.type === 'tool_result')
      expect((toolResult as { isError: boolean } | undefined)?.isError).toBe(true)
    })

    it('getToolNames returns all registered tool names', () => {
      const agent = new FreeCodeAgent({ apiKey: 'test' })
      const names = agent.getToolNames()
      expect(Array.isArray(names)).toBe(true)
      expect(names.length).toBeGreaterThan(5)
    })
  })
})
