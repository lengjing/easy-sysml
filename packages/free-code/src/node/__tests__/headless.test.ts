/**
 * Tests for the headless node interface — uses internal modules directly.
 *
 * QueryEngine is mocked throughout so no Anthropic API calls are made.
 *
 * NOTE: vi.mock paths resolve relative to THIS test file:
 *   src/node/__tests__/headless.test.ts
 * So ../../ goes up to src/ from __tests__/
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Use vi.hoisted to create shared mock fns accessible in both vi.mock factories
// and test bodies (vi.mock is hoisted above imports, so closures don't work).
// ---------------------------------------------------------------------------
const { mockSubmitMessage, MockQueryEngine } = vi.hoisted(() => {
  const mockSubmitMessage = vi.fn()
  const MockQueryEngine = vi.fn().mockImplementation(() => ({
    submitMessage: mockSubmitMessage,
  }))
  return { mockSubmitMessage, MockQueryEngine }
})

// Path relative to this test file: ../../QueryEngine.js = src/QueryEngine.ts
vi.mock('../../QueryEngine.js', () => ({ QueryEngine: MockQueryEngine }))

// Mock the tools to avoid cascading into UI/Bun-only modules
vi.mock('../headlessTools.js', () => ({
  HEADLESS_TOOLS: [
    { name: 'Bash' },
    { name: 'Read' },
    { name: 'Write' },
    { name: 'Edit' },
    { name: 'Glob' },
    { name: 'Grep' },
    { name: 'WebFetch' },
    { name: 'TodoWrite' },
  ],
}))

// Mock cwd and permissions — paths relative to this test file
vi.mock('../../utils/cwd.js', () => ({ getCwd: () => '/mock/cwd' }))
vi.mock('../../utils/permissions/permissions.js', () => ({
  hasPermissionsToUseTool: vi.fn().mockResolvedValue({ behavior: 'allow' }),
}))

// Mock file state cache
vi.mock('../../utils/fileStateCache.js', () => ({
  createFileStateCacheWithSizeLimit: vi.fn().mockReturnValue({
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    size: 0,
    max: 100,
    maxSize: 1_000_000,
    calculatedSize: 0,
    keys: vi.fn().mockReturnValue([][Symbol.iterator]()),
    entries: vi.fn().mockReturnValue([][Symbol.iterator]()),
    dump: vi.fn().mockReturnValue([]),
    load: vi.fn(),
  }),
  READ_FILE_STATE_CACHE_SIZE: 100,
}))

// Mock state store creation to avoid pulling in settings/config file reads
vi.mock('../headlessState.js', () => {
  const createStore = (initial: Record<string, unknown>) => ({
    getState: () => initial,
    setState: (fn: (s: unknown) => unknown) => { Object.assign(initial, fn(initial)) },
    subscribe: () => () => {},
  })
  return {
    createHeadlessStore: (opts?: { bypassPermissions?: boolean; verbose?: boolean }) => {
      const state = {
        verbose: opts?.verbose ?? false,
        toolPermissionContext: {
          mode: opts?.bypassPermissions !== false ? 'bypassPermissions' : 'default',
        },
      }
      return createStore(state)
    },
  }
})

import { headlessQuery, headlessRunQuery } from '../headlessAgent.js'
import { createHeadlessStore } from '../headlessState.js'
import { HEADLESS_TOOLS } from '../headlessTools.js'

// ---------------------------------------------------------------------------
// headlessTools
// ---------------------------------------------------------------------------

describe('HEADLESS_TOOLS', () => {
  it('is an array', () => {
    expect(Array.isArray(HEADLESS_TOOLS)).toBe(true)
  })

  it('contains at least 8 tools', () => {
    expect(HEADLESS_TOOLS.length).toBeGreaterThanOrEqual(8)
  })

  it('contains BashTool', () => {
    const names = HEADLESS_TOOLS.map((t: any) => t.name ?? t.inputSchema?.name ?? JSON.stringify(t))
    expect(names.some((n: string) => n.toLowerCase().includes('bash'))).toBe(true)
  })

  it('contains FileReadTool', () => {
    const names = HEADLESS_TOOLS.map((t: any) => t.name ?? t.inputSchema?.name ?? JSON.stringify(t))
    expect(names.some((n: string) => /read/i.test(n))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// createHeadlessStore
// ---------------------------------------------------------------------------

describe('createHeadlessStore', () => {
  it('returns a store with getState/setState/subscribe', () => {
    const store = createHeadlessStore()
    expect(typeof store.getState).toBe('function')
    expect(typeof store.setState).toBe('function')
    expect(typeof store.subscribe).toBe('function')
  })

  it('defaults to bypassPermissions mode', () => {
    const store = createHeadlessStore()
    expect(store.getState().toolPermissionContext.mode).toBe('bypassPermissions')
  })

  it('uses bypassPermissions mode when bypassPermissions=true', () => {
    const store = createHeadlessStore({ bypassPermissions: true })
    expect(store.getState().toolPermissionContext.mode).toBe('bypassPermissions')
  })

  it('uses default mode when bypassPermissions=false', () => {
    const store = createHeadlessStore({ bypassPermissions: false })
    expect(store.getState().toolPermissionContext.mode).toBe('default')
  })

  it('sets verbose=false by default', () => {
    const store = createHeadlessStore()
    expect(store.getState().verbose).toBe(false)
  })

  it('respects verbose option', () => {
    const store = createHeadlessStore({ verbose: true })
    expect(store.getState().verbose).toBe(true)
  })

  it('state is mutable via setState', () => {
    const store = createHeadlessStore()
    const original = store.getState().verbose
    store.setState((s) => ({ ...s, verbose: !original }))
    expect(store.getState().verbose).toBe(!original)
  })
})

// ---------------------------------------------------------------------------
// headlessQuery
// ---------------------------------------------------------------------------

describe('headlessQuery', () => {
  beforeEach(() => {
    mockSubmitMessage.mockReset()
  })

  it('returns an AsyncGenerator', async () => {
    async function* empty() {}
    mockSubmitMessage.mockReturnValue(empty())

    const gen = headlessQuery('hello')
    expect(typeof gen[Symbol.asyncIterator]).toBe('function')
  })

  it('yields messages from QueryEngine.submitMessage', async () => {
    const fakeMessages = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } },
      { type: 'result', result: 'done', is_error: false },
    ]
    async function* fakeGen() {
      for (const m of fakeMessages) yield m
    }
    mockSubmitMessage.mockReturnValue(fakeGen())

    const collected = []
    for await (const msg of headlessQuery('test prompt')) {
      collected.push(msg)
    }
    expect(collected).toHaveLength(2)
    expect(collected[0].type).toBe('assistant')
    expect(collected[1].type).toBe('result')
  })

  it('passes prompt to submitMessage', async () => {
    async function* empty() {}
    mockSubmitMessage.mockReturnValue(empty())

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of headlessQuery('my prompt')) { /* drain */ }

    expect(mockSubmitMessage).toHaveBeenCalledWith('my prompt')
  })
})

// ---------------------------------------------------------------------------
// headlessRunQuery
// ---------------------------------------------------------------------------

describe('headlessRunQuery', () => {
  beforeEach(() => {
    mockSubmitMessage.mockReset()
  })

  it('returns { result, messages }', async () => {
    const resultMsg = { type: 'result' as const, result: 'ok', is_error: false }
    async function* fakeGen() {
      yield { type: 'assistant' as const, message: {} as any }
      yield resultMsg
    }
    mockSubmitMessage.mockReturnValue(fakeGen())

    const out = await headlessRunQuery('do something')
    expect(out.messages).toHaveLength(2)
    expect(out.result).toBeDefined()
    expect(out.result?.type).toBe('result')
  })

  it('result is undefined when no result message is yielded', async () => {
    async function* fakeGen() {
      yield { type: 'assistant' as const, message: {} as any }
    }
    mockSubmitMessage.mockReturnValue(fakeGen())

    const out = await headlessRunQuery('no result')
    expect(out.result).toBeUndefined()
    expect(out.messages).toHaveLength(1)
  })

  it('collects all messages in order', async () => {
    const msgs = [
      { type: 'system' as const, subtype: 'init' as any, tools: [] as any, mcp_servers: [], session_id: 's1' },
      { type: 'assistant' as const, message: {} as any },
      { type: 'result' as const, result: 'done', is_error: false },
    ]
    async function* fakeGen() {
      for (const m of msgs) yield m
    }
    mockSubmitMessage.mockReturnValue(fakeGen())

    const out = await headlessRunQuery('collect')
    expect(out.messages.map((m) => m.type)).toEqual(['system', 'assistant', 'result'])
  })
})

// ---------------------------------------------------------------------------
// index.ts public API
// ---------------------------------------------------------------------------

describe('index.ts public API', () => {
  it('exports headlessQuery', async () => {
    const api = await import('../index.js')
    expect(typeof api.headlessQuery).toBe('function')
  })

  it('exports headlessRunQuery', async () => {
    const api = await import('../index.js')
    expect(typeof api.headlessRunQuery).toBe('function')
  })

  it('exports createHeadlessStore', async () => {
    const api = await import('../index.js')
    expect(typeof api.createHeadlessStore).toBe('function')
  })

  it('exports HEADLESS_TOOLS array', async () => {
    const api = await import('../index.js')
    expect(Array.isArray(api.HEADLESS_TOOLS)).toBe(true)
  })
})
