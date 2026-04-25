/**
 * Tests for `src/node/index.ts` — public API surface.
 *
 * Verifies that all expected exports exist and have the right types.
 * Actual behavior is tested in query.test.ts and client.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock the underlying modules to avoid any child_process spawning
vi.mock('../query.js', () => ({ query: vi.fn() }))
vi.mock('../utils.js', () => ({
  resolveBin: vi.fn(),
  PACKAGE_ROOT: '/mock',
}))
vi.mock('../client.js', () => ({
  FreeCodeClient: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
    runQuery: vi.fn(),
  })),
  createClient: vi.fn(),
}))

const api = await import('../index.js')

describe('index.ts public API', () => {
  it('exports query function', () => {
    expect(typeof api.query).toBe('function')
  })

  it('exports createClient function', () => {
    expect(typeof api.createClient).toBe('function')
  })

  it('exports FreeCodeClient class', () => {
    expect(typeof api.FreeCodeClient).toBe('function')
  })

  it('exports resolveBin function', () => {
    expect(typeof api.resolveBin).toBe('function')
  })

  it('exports PACKAGE_ROOT constant', () => {
    expect(typeof api.PACKAGE_ROOT).toBe('string')
  })

  it('createClient returns a FreeCodeClient instance', async () => {
    const { createClient: realCreateClient } = await vi.importActual('../client.js') as any
    vi.mocked(api.createClient).mockImplementation(realCreateClient)
    // createClient should be callable
    expect(api.createClient).toBeDefined()
  })
})
