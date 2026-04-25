/**
 * Tests for file tools: readFile, writeFile, editFile.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFile, writeFile, editFile } from '../tools/file.js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'free-code-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// writeFile
// ---------------------------------------------------------------------------

describe('writeFile', () => {
  it('creates a new file with the given content', async () => {
    const result = await writeFile(
      { path: 'hello.txt', content: 'Hello World' },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(false)
    expect(result.output).toContain('hello.txt')
  })

  it('overwrites an existing file', async () => {
    await writeFile({ path: 'file.txt', content: 'old' }, { cwd: tmpDir })
    const result = await writeFile({ path: 'file.txt', content: 'new' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
  })

  it('creates parent directories automatically', async () => {
    const result = await writeFile(
      { path: 'a/b/c.txt', content: 'nested' },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(false)
  })

  it('handles empty content', async () => {
    const result = await writeFile({ path: 'empty.txt', content: '' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
  })

  it('handles absolute path', async () => {
    const absPath = join(tmpDir, 'abs.txt')
    const result = await writeFile({ path: absPath, content: 'abs content' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// readFile
// ---------------------------------------------------------------------------

describe('readFile', () => {
  it('reads a file and returns line-numbered content', async () => {
    await writeFile({ path: 'data.txt', content: 'line1\nline2\nline3' }, { cwd: tmpDir })
    const result = await readFile({ path: 'data.txt' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('line1')
    expect(result.output).toContain('line2')
    expect(result.output).toContain('line3')
    // Line numbers
    expect(result.output).toMatch(/\s*1\s*\|/)
    expect(result.output).toMatch(/\s*2\s*\|/)
    expect(result.output).toMatch(/\s*3\s*\|/)
  })

  it('reads a specific line range', async () => {
    await writeFile(
      { path: 'range.txt', content: 'a\nb\nc\nd\ne' },
      { cwd: tmpDir },
    )
    const result = await readFile({ path: 'range.txt', startLine: 2, endLine: 4 }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).not.toContain('| a')
    expect(result.output).toContain('b')
    expect(result.output).toContain('c')
    expect(result.output).toContain('d')
    expect(result.output).not.toContain('| e')
  })

  it('returns isError=true for missing file', async () => {
    const result = await readFile({ path: 'does_not_exist.txt' }, { cwd: tmpDir })
    expect(result.isError).toBe(true)
  })

  it('returns "(empty file)" for empty files', async () => {
    await writeFile({ path: 'empty.txt', content: '' }, { cwd: tmpDir })
    const result = await readFile({ path: 'empty.txt' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toBe('(empty file)')
  })

  it('clamps endLine to file length', async () => {
    await writeFile({ path: 'short.txt', content: 'a\nb' }, { cwd: tmpDir })
    const result = await readFile({ path: 'short.txt', startLine: 1, endLine: 999 }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('a')
    expect(result.output).toContain('b')
  })
})

// ---------------------------------------------------------------------------
// editFile
// ---------------------------------------------------------------------------

describe('editFile', () => {
  it('replaces a line range with new content', async () => {
    await writeFile(
      { path: 'edit.txt', content: 'aaa\nbbb\nccc\nddd' },
      { cwd: tmpDir },
    )
    const result = await editFile(
      { path: 'edit.txt', startLine: 2, endLine: 3, newContent: 'REPLACED' },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(false)

    // Verify the file content
    const read = await readFile({ path: 'edit.txt' }, { cwd: tmpDir })
    expect(read.output).toContain('aaa')
    expect(read.output).toContain('REPLACED')
    expect(read.output).toContain('ddd')
    expect(read.output).not.toContain('bbb')
    expect(read.output).not.toContain('ccc')
  })

  it('replaces a single line', async () => {
    await writeFile({ path: 'single.txt', content: 'a\nb\nc' }, { cwd: tmpDir })
    const result = await editFile(
      { path: 'single.txt', startLine: 2, endLine: 2, newContent: 'B-REPLACED' },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(false)
    const read = await readFile({ path: 'single.txt' }, { cwd: tmpDir })
    expect(read.output).toContain('B-REPLACED')
    expect(read.output).not.toContain('| b')
  })

  it('can insert multiple lines in place of one', async () => {
    await writeFile({ path: 'multi.txt', content: 'a\nb\nc' }, { cwd: tmpDir })
    const result = await editFile(
      { path: 'multi.txt', startLine: 2, endLine: 2, newContent: 'x\ny\nz' },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(false)
    const read = await readFile({ path: 'multi.txt' }, { cwd: tmpDir })
    expect(read.output).toContain('x')
    expect(read.output).toContain('y')
    expect(read.output).toContain('z')
  })

  it('returns isError=true for missing file', async () => {
    const result = await editFile(
      { path: 'nope.txt', startLine: 1, endLine: 1, newContent: 'x' },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(true)
  })

  it('returns isError=true for invalid line range', async () => {
    await writeFile({ path: 'small.txt', content: 'only one line' }, { cwd: tmpDir })
    const result = await editFile(
      { path: 'small.txt', startLine: 5, endLine: 10, newContent: 'x' },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(true)
  })
})
