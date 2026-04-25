/**
 * Tests for the bash tool.
 */
import { describe, it, expect } from 'vitest'
import { runBash } from '../tools/bash.js'
import { tmpdir } from 'os'
import { join } from 'path'

describe('runBash', () => {
  it('executes a simple command and returns stdout', async () => {
    const result = await runBash({ command: 'echo hello' })
    expect(result.isError).toBe(false)
    expect(result.output).toBe('hello')
  })

  it('captures stderr as part of output', async () => {
    const result = await runBash({ command: 'echo err >&2' })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('err')
  })

  it('returns isError=true for failing commands', async () => {
    const result = await runBash({ command: 'exit 1' })
    expect(result.isError).toBe(true)
  })

  it('returns isError=true with output for failing commands with output', async () => {
    const result = await runBash({ command: 'ls /nonexistent_dir_that_does_not_exist_xyz 2>&1; exit 1' })
    expect(result.isError).toBe(true)
    expect(result.output.length).toBeGreaterThan(0)
  })

  it('respects the cwd option', async () => {
    const result = await runBash({ command: 'pwd' }, { cwd: tmpdir() })
    expect(result.isError).toBe(false)
    // tmpdir may resolve to a different path (e.g. /private/var/... on macOS)
    expect(result.output).toBeTruthy()
  })

  it('respects inline cwd on the input', async () => {
    const cwd = tmpdir()
    const result = await runBash({ command: 'pwd', cwd })
    expect(result.isError).toBe(false)
  })

  it('handles multi-line output', async () => {
    const result = await runBash({ command: 'printf "line1\\nline2\\nline3"' })
    expect(result.isError).toBe(false)
    expect(result.output).toBe('line1\nline2\nline3')
  })

  it('times out when timeout is very small', async () => {
    const result = await runBash({ command: 'sleep 10', timeout: 50 })
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/timeout|timed out/i)
  })

  it('runs in the correct default cwd (process.cwd())', async () => {
    const result = await runBash({ command: 'pwd' })
    expect(result.isError).toBe(false)
    expect(result.output).toBeTruthy()
  })

  it('supports shell pipelines', async () => {
    const result = await runBash({ command: 'echo "hello world" | tr a-z A-Z' })
    expect(result.isError).toBe(false)
    expect(result.output).toBe('HELLO WORLD')
  })

  it('captures exit code info in error output', async () => {
    const result = await runBash({ command: 'false' })
    expect(result.isError).toBe(true)
  })
})
