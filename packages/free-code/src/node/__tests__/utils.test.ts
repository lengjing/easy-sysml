/**
 * Tests for `src/node/utils.ts` — binary discovery.
 *
 * We mock `fs.existsSync` and `process.env` to control which binary paths exist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'fs'
import { resolve, join } from 'path'

// Hoist mocks so they run before module imports
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}))

const { resolveBin, PACKAGE_ROOT } = await import('../utils.js')

const existsSyncMock = vi.mocked(existsSync)

describe('resolveBin', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    savedEnv.FREE_CODE_BIN = process.env.FREE_CODE_BIN
    delete process.env.FREE_CODE_BIN
    existsSyncMock.mockReset()
    existsSyncMock.mockReturnValue(false)
  })

  afterEach(() => {
    if (savedEnv.FREE_CODE_BIN !== undefined) {
      process.env.FREE_CODE_BIN = savedEnv.FREE_CODE_BIN
    } else {
      delete process.env.FREE_CODE_BIN
    }
  })

  it('returns explicit binPath when provided', () => {
    const result = resolveBin('/custom/cli')
    expect(result.mode).toBe('binary')
    expect(result.bin).toBe(resolve('/custom/cli'))
    expect(result.prefixArgs).toEqual([])
  })

  it('prefers FREE_CODE_BIN env var over auto-discovery', () => {
    process.env.FREE_CODE_BIN = '/env/free-code'
    const result = resolveBin()
    expect(result.mode).toBe('binary')
    expect(result.bin).toBe(resolve('/env/free-code'))
  })

  it('finds ./cli binary', () => {
    const cliBin = join(PACKAGE_ROOT, 'cli')
    existsSyncMock.mockImplementation((p) => p === cliBin)
    const result = resolveBin()
    expect(result.mode).toBe('binary')
    expect(result.bin).toBe(cliBin)
    expect(result.prefixArgs).toEqual([])
  })

  it('falls back to ./cli-dev when ./cli not found', () => {
    const cliBin = join(PACKAGE_ROOT, 'cli')
    const cliDevBin = join(PACKAGE_ROOT, 'cli-dev')
    existsSyncMock.mockImplementation((p) => p === cliDevBin && p !== cliBin)
    const result = resolveBin()
    expect(result.mode).toBe('binary')
    expect(result.bin).toBe(cliDevBin)
  })

  it('falls back to bun source mode when no binary found', () => {
    const sourceEntry = join(PACKAGE_ROOT, 'src', 'entrypoints', 'cli.tsx')
    existsSyncMock.mockImplementation((p) => p === sourceEntry)
    const result = resolveBin()
    expect(result.mode).toBe('bun-source')
    expect(result.bin).toBe('bun')
    expect(result.prefixArgs).toEqual(['run', sourceEntry])
  })

  it('throws when no binary found at all', () => {
    existsSyncMock.mockReturnValue(false)
    expect(() => resolveBin()).toThrow(/free-code binary not found/)
  })

  it('explicit binPath takes priority over env var', () => {
    process.env.FREE_CODE_BIN = '/env/free-code'
    const result = resolveBin('/explicit/cli')
    expect(result.bin).toBe(resolve('/explicit/cli'))
  })

  it('explicit binPath takes priority over ./cli', () => {
    const cliBin = join(PACKAGE_ROOT, 'cli')
    existsSyncMock.mockImplementation((p) => p === cliBin)
    const result = resolveBin('/my/custom/bin')
    expect(result.bin).toBe(resolve('/my/custom/bin'))
  })

  it('PACKAGE_ROOT is an absolute path', () => {
    expect(PACKAGE_ROOT).toMatch(/^\//)
  })
})
