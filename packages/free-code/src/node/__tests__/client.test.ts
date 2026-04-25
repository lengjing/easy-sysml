/**
 * Tests for `src/node/client.ts` — FreeCodeClient and createClient.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the query module before importing client
vi.mock('../query.js', () => ({
  query: vi.fn(),
}))

const { query } = await import('../query.js')
const queryMock = vi.mocked(query)

const { FreeCodeClient, createClient } = await import('../client.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function* syncMsgs(...msgs: object[]) {
  for (const m of msgs) yield m
}

async function* asyncMsgs(...msgs: object[]) {
  for (const m of msgs) yield m
}

const RESULT_MSG = {
  type: 'result',
  subtype: 'success',
  result: 'Task completed',
  is_error: false,
  total_cost_usd: 0.002,
  duration_ms: 5000,
  num_turns: 3,
  session_id: 'sess-xyz',
}

const ASSISTANT_MSG = {
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'Processing...' }] },
  session_id: 'sess-xyz',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FreeCodeClient', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  describe('constructor & defaults', () => {
    it('creates client with default options', () => {
      const client = new FreeCodeClient()
      expect(client).toBeDefined()
    })

    it('creates client with explicit options', () => {
      const client = new FreeCodeClient({ cwd: '/project', model: 'claude-opus-4-6' })
      expect(client).toBeDefined()
    })
  })

  describe('query()', () => {
    it('returns async generator from underlying query()', async () => {
      queryMock.mockReturnValue(asyncMsgs(ASSISTANT_MSG, RESULT_MSG))

      const client = new FreeCodeClient()
      const msgs = []
      for await (const msg of client.query('hello')) {
        msgs.push(msg)
      }

      expect(msgs).toHaveLength(2)
      expect(msgs[0]).toMatchObject({ type: 'assistant' })
      expect(msgs[1]).toMatchObject({ type: 'result' })
    })

    it('merges default options with per-query options', async () => {
      queryMock.mockReturnValue(asyncMsgs(RESULT_MSG))

      const client = new FreeCodeClient({ model: 'claude-sonnet-4-6', maxTurns: 10 })
      for await (const _ of client.query('test', { cwd: '/custom' })) {
        // drain
      }

      expect(queryMock).toHaveBeenCalledWith('test', expect.objectContaining({
        model: 'claude-sonnet-4-6',
        maxTurns: 10,
        cwd: '/custom',
      }))
    })

    it('per-query options override defaults', async () => {
      queryMock.mockReturnValue(asyncMsgs(RESULT_MSG))

      const client = new FreeCodeClient({ model: 'claude-sonnet-4-6' })
      for await (const _ of client.query('test', { model: 'claude-opus-4-6' })) {
        // drain
      }

      expect(queryMock).toHaveBeenCalledWith('test', expect.objectContaining({
        model: 'claude-opus-4-6',
      }))
    })

    it('passes prompt through to underlying query()', async () => {
      queryMock.mockReturnValue(asyncMsgs(RESULT_MSG))

      const client = new FreeCodeClient()
      for await (const _ of client.query('Fix the TypeScript errors in src/')) {
        // drain
      }

      expect(queryMock).toHaveBeenCalledWith('Fix the TypeScript errors in src/', expect.any(Object))
    })
  })

  describe('runQuery()', () => {
    it('returns result with correct fields', async () => {
      queryMock.mockReturnValue(asyncMsgs(ASSISTANT_MSG, RESULT_MSG))

      const client = new FreeCodeClient()
      const result = await client.runQuery('do something')

      expect(result.result).toBe('Task completed')
      expect(result.isError).toBe(false)
      expect(result.totalCostUSD).toBe(0.002)
      expect(result.durationMs).toBe(5000)
      expect(result.sessionId).toBe('sess-xyz')
    })

    it('collects all messages', async () => {
      const msgs = [
        { type: 'system', subtype: 'init', tools: ['Bash', 'Read'], session_id: 'sess-1' },
        ASSISTANT_MSG,
        { type: 'tool_progress', tool_name: 'Bash', data: {}, session_id: 'sess-1' },
        RESULT_MSG,
      ]
      queryMock.mockReturnValue(asyncMsgs(...msgs))

      const client = new FreeCodeClient()
      const result = await client.runQuery('test')

      expect(result.messages).toHaveLength(4)
      expect(result.messages[0]).toMatchObject({ type: 'system' })
      expect(result.messages[1]).toMatchObject({ type: 'assistant' })
      expect(result.messages[2]).toMatchObject({ type: 'tool_progress' })
      expect(result.messages[3]).toMatchObject({ type: 'result' })
    })

    it('sets isError=true for error result', async () => {
      const errorResult = {
        type: 'result',
        subtype: 'error_during_execution',
        result: '',
        is_error: true,
        session_id: 'sess-err',
      }
      queryMock.mockReturnValue(asyncMsgs(errorResult))

      const client = new FreeCodeClient()
      const result = await client.runQuery('failing task')

      expect(result.isError).toBe(true)
      expect(result.result).toBe('')
    })

    it('returns empty result when no result message', async () => {
      queryMock.mockReturnValue(asyncMsgs(ASSISTANT_MSG))

      const client = new FreeCodeClient()
      const result = await client.runQuery('test')

      expect(result.result).toBe('')
      expect(result.isError).toBe(false)
    })

    it('passes options to query()', async () => {
      queryMock.mockReturnValue(asyncMsgs(RESULT_MSG))

      const client = new FreeCodeClient({ cwd: '/workspace' })
      await client.runQuery('test', { maxTurns: 5 })

      expect(queryMock).toHaveBeenCalledWith('test', expect.objectContaining({
        cwd: '/workspace',
        maxTurns: 5,
      }))
    })

    it('returns numTurns from result message', async () => {
      queryMock.mockReturnValue(asyncMsgs(RESULT_MSG))

      const client = new FreeCodeClient()
      const result = await client.runQuery('test')

      expect(result.numTurns).toBe(3)
    })
  })
})

describe('createClient()', () => {
  it('returns a FreeCodeClient instance', () => {
    const client = createClient()
    expect(client).toBeInstanceOf(FreeCodeClient)
  })

  it('passes options to FreeCodeClient', async () => {
    queryMock.mockReturnValue(asyncMsgs(RESULT_MSG))

    const client = createClient({ model: 'claude-haiku-4-5', maxTurns: 10 })
    for await (const _ of client.query('test')) {
      // drain
    }

    expect(queryMock).toHaveBeenCalledWith('test', expect.objectContaining({
      model: 'claude-haiku-4-5',
      maxTurns: 10,
    }))
  })

  it('accepts no options', () => {
    expect(() => createClient()).not.toThrow()
  })

  it('accepts all QueryOptions', async () => {
    queryMock.mockReturnValue(asyncMsgs(RESULT_MSG))

    const client = createClient({
      cwd: '/project',
      model: 'claude-opus-4-6',
      maxTurns: 20,
      maxBudgetUSD: 5.0,
      dangerouslySkipPermissions: true,
      systemPrompt: 'You are a coding assistant.',
      env: { MY_KEY: 'value' },
      sessionId: 'sess-resume',
      binPath: '/custom/cli',
    })

    for await (const _ of client.query('test')) {
      // drain
    }

    expect(queryMock).toHaveBeenCalledWith('test', expect.objectContaining({
      cwd: '/project',
      model: 'claude-opus-4-6',
      maxTurns: 20,
      maxBudgetUSD: 5.0,
      dangerouslySkipPermissions: true,
      systemPrompt: 'You are a coding assistant.',
      sessionId: 'sess-resume',
    }))
  })
})
