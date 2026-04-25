/**
 * Tests for `src/node/query.ts` — CLI subprocess spawning and NDJSON parsing.
 *
 * All tests mock `child_process.spawn` so no real binary is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter, Readable } from 'stream'

// ---------------------------------------------------------------------------
// Mock child_process before importing query module
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({ spawn: vi.fn() }))
vi.mock('../utils.js', () => ({
  resolveBin: vi.fn(() => ({ mode: 'binary', bin: '/mock/cli', prefixArgs: [] })),
  PACKAGE_ROOT: '/mock/package',
}))

const { spawn } = await import('child_process')
const spawnMock = vi.mocked(spawn)

const { query } = await import('../query.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FakeProcess = EventEmitter & {
  stdout: Readable
  stderr: Readable
  kill: ReturnType<typeof vi.fn>
}

function makeMessages(...msgs: object[]): string {
  return msgs.map((m) => JSON.stringify(m)).join('\n') + '\n'
}

function makeProcess(output: string, exitCode = 0): FakeProcess {
  const proc = new EventEmitter() as FakeProcess
  proc.stdout = Readable.from([output])
  proc.stderr = Readable.from([''])
  proc.kill = vi.fn(() => {
    setTimeout(() => proc.emit('close', exitCode), 0)
    return true
  })
  // Auto-emit close after a tick
  setTimeout(() => proc.emit('close', exitCode), 20)
  return proc
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('query()', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it('yields system init message', async () => {
    const initMsg = { type: 'system', subtype: 'init', tools: ['Bash', 'Read'], session_id: 'sess-1' }
    const resultMsg = { type: 'result', subtype: 'success', result: 'Done', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(initMsg, resultMsg)) as any)

    const msgs = []
    for await (const msg of query('test prompt')) {
      msgs.push(msg)
    }

    expect(msgs[0]).toMatchObject({ type: 'system', subtype: 'init' })
    expect(msgs[0]).toHaveProperty('tools')
  })

  it('yields assistant messages with content', async () => {
    const assistantMsg = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello world' }] },
      session_id: 'sess-1',
    }
    const resultMsg = { type: 'result', subtype: 'success', result: 'Hello world', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(assistantMsg, resultMsg)) as any)

    const msgs = []
    for await (const msg of query('say hello')) {
      msgs.push(msg)
    }

    const assistant = msgs.find((m) => m.type === 'assistant')
    expect(assistant).toBeDefined()
    expect((assistant as any).message.content[0].text).toBe('Hello world')
  })

  it('yields tool_progress messages during tool execution', async () => {
    const progressMsg = { type: 'tool_progress', tool_name: 'Bash', data: { command: 'ls' }, session_id: 'sess-1' }
    const resultMsg = { type: 'result', subtype: 'success', result: 'Done', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(progressMsg, resultMsg)) as any)

    const msgs = []
    for await (const msg of query('list files')) {
      msgs.push(msg)
    }

    expect(msgs.some((m) => m.type === 'tool_progress')).toBe(true)
  })

  it('yields result message at end', async () => {
    const resultMsg = {
      type: 'result',
      subtype: 'success',
      result: 'Final result',
      is_error: false,
      total_cost_usd: 0.001,
      duration_ms: 1234,
      num_turns: 3,
      session_id: 'sess-42',
    }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    const msgs = []
    for await (const msg of query('do something')) {
      msgs.push(msg)
    }

    const result = msgs.find((m) => m.type === 'result')
    expect(result).toMatchObject({
      type: 'result',
      result: 'Final result',
      is_error: false,
      session_id: 'sess-42',
    })
  })

  it('passes -p flag and stream-json output format to CLI', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('hello')) {
      // drain
    }

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).toContain('-p')
    expect(args).toContain('hello')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
  })

  it('passes --model when specified', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { model: 'claude-opus-4-6' })) {
      // drain
    }

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).toContain('--model')
    expect(args).toContain('claude-opus-4-6')
  })

  it('passes --max-turns when specified', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { maxTurns: 5 })) {
      // drain
    }

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).toContain('--max-turns')
    expect(args).toContain('5')
  })

  it('passes --dangerously-skip-permissions when set', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { dangerouslySkipPermissions: true })) {
      // drain
    }

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).toContain('--dangerously-skip-permissions')
  })

  it('does NOT pass --dangerously-skip-permissions when false', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { dangerouslySkipPermissions: false })) {
      // drain
    }

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).not.toContain('--dangerously-skip-permissions')
  })

  it('passes --system-prompt when specified', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { systemPrompt: 'You are a test bot' })) {
      // drain
    }

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).toContain('--system-prompt')
    expect(args).toContain('You are a test bot')
  })

  it('passes --resume when sessionId specified', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-abc' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { sessionId: 'sess-abc' })) {
      // drain
    }

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).toContain('--resume')
    expect(args).toContain('sess-abc')
  })

  it('passes --max-budget-usd when specified', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { maxBudgetUSD: 1.5 })) {
      // drain
    }

    const args = spawnMock.mock.calls[0]?.[1] as string[]
    expect(args).toContain('--max-budget-usd')
    expect(args).toContain('1.5')
  })

  it('uses custom cwd when specified', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { cwd: '/custom/dir' })) {
      // drain
    }

    const spawnOpts = spawnMock.mock.calls[0]?.[2] as { cwd?: string }
    expect(spawnOpts.cwd).toBe('/custom/dir')
  })

  it('merges custom env variables with process.env', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    for await (const _ of query('test', { env: { MY_VAR: 'hello' } })) {
      // drain
    }

    const spawnOpts = spawnMock.mock.calls[0]?.[2] as { env?: Record<string, string> }
    expect(spawnOpts.env?.MY_VAR).toBe('hello')
  })

  it('skips non-JSON lines in output', async () => {
    const output = 'not json\n' + JSON.stringify({ type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 's1' }) + '\n'
    spawnMock.mockReturnValue(makeProcess(output) as any)

    const msgs = []
    for await (const msg of query('test')) {
      msgs.push(msg)
    }

    expect(msgs).toHaveLength(1)
    expect(msgs[0]?.type).toBe('result')
  })

  it('stops after first result message', async () => {
    const result1 = { type: 'result', subtype: 'success', result: 'first', is_error: false, session_id: 's1' }
    const result2 = { type: 'result', subtype: 'success', result: 'second', is_error: false, session_id: 's1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(result1, result2)) as any)

    const msgs = []
    for await (const msg of query('test')) {
      msgs.push(msg)
    }

    // Should stop at first result
    const results = msgs.filter((m) => m.type === 'result')
    expect(results).toHaveLength(1)
    expect((results[0] as any).result).toBe('first')
  })

  it('handles abort signal', async () => {
    const ac = new AbortController()
    const proc = makeProcess('') // empty output, never emits result

    // Override kill to simulate abort
    proc.kill = vi.fn(() => {
      proc.emit('close', 0)
      return true
    })
    spawnMock.mockReturnValue(proc as any)

    const msgs: object[] = []
    const queryGen = query('test', { signal: ac.signal })

    // Abort immediately
    ac.abort()

    // Should complete without throwing
    try {
      for await (const msg of queryGen) {
        msgs.push(msg)
      }
    } catch {
      // May throw on abort — that's acceptable
    }

    // kill should have been called
    expect(proc.kill).toHaveBeenCalled()
  })

  it('throws when process exits with non-zero code and no output', async () => {
    const proc = new EventEmitter() as FakeProcess
    proc.stdout = Readable.from([''])
    proc.stderr = Readable.from(['something went wrong'])
    proc.kill = vi.fn(() => {
      setTimeout(() => proc.emit('close', 1), 0)
      return true
    })
    setTimeout(() => proc.emit('close', 1), 20)
    spawnMock.mockReturnValue(proc as any)

    await expect(async () => {
      for await (const _ of query('test')) {
        // drain
      }
    }).rejects.toThrow(/free-code process exited/)
  })

  it('uses binPath from options', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    const { resolveBin } = await import('../utils.js')
    const resolveBinMock = vi.mocked(resolveBin)
    resolveBinMock.mockReturnValueOnce({ mode: 'binary', bin: '/custom/bin', prefixArgs: [] })

    for await (const _ of query('test', { binPath: '/custom/bin' })) {
      // drain
    }

    expect(resolveBinMock).toHaveBeenCalledWith('/custom/bin')
  })

  it('uses bun prefixArgs when running in source mode', async () => {
    const resultMsg = { type: 'result', subtype: 'success', result: 'ok', is_error: false, session_id: 'sess-1' }
    spawnMock.mockReturnValue(makeProcess(makeMessages(resultMsg)) as any)

    const { resolveBin } = await import('../utils.js')
    const resolveBinMock = vi.mocked(resolveBin)
    resolveBinMock.mockReturnValueOnce({
      mode: 'bun-source',
      bin: 'bun',
      prefixArgs: ['run', '/pkg/src/entrypoints/cli.tsx'],
    })

    for await (const _ of query('test')) {
      // drain
    }

    const [bin, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(bin).toBe('bun')
    expect(args[0]).toBe('run')
    expect(args[1]).toBe('/pkg/src/entrypoints/cli.tsx')
  })
})
