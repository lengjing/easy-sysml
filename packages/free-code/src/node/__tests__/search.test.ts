/**
 * Tests for search tools: globSearch, grepSearch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { globSearch, grepSearch } from '../tools/search.js'
import { writeFile } from '../tools/file.js'
import { mkdtemp, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'free-code-search-test-'))
  // Create a test file tree
  await writeFile({ path: 'src/index.ts', content: 'export const a = 1;\nexport const b = 2;' }, { cwd: tmpDir })
  await writeFile({ path: 'src/utils.ts', content: 'export function helper() { return "help"; }' }, { cwd: tmpDir })
  await writeFile({ path: 'src/sub/deep.ts', content: 'const deep = "deep";\n// TODO: remove this' }, { cwd: tmpDir })
  await writeFile({ path: 'README.md', content: '# Project\n\nSome **bold** text.' }, { cwd: tmpDir })
  await writeFile({ path: 'package.json', content: '{"name":"test"}' }, { cwd: tmpDir })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// globSearch
// ---------------------------------------------------------------------------

describe('globSearch', () => {
  it('finds TypeScript files with **/*.ts pattern', async () => {
    const result = await globSearch({ pattern: '**/*.ts' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('index.ts')
    expect(result.output).toContain('utils.ts')
    expect(result.output).toContain('deep.ts')
  })

  it('finds only markdown files with *.md pattern', async () => {
    const result = await globSearch({ pattern: '*.md' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('README.md')
    expect(result.output).not.toContain('index.ts')
  })

  it('finds files in a subdirectory with src/**/*.ts', async () => {
    const result = await globSearch({ pattern: 'src/**/*.ts' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('index.ts')
  })

  it('returns "No files matched." when pattern does not match', async () => {
    const result = await globSearch({ pattern: '**/*.go' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toBe('No files matched.')
  })

  it('finds exact file name with simple pattern', async () => {
    const result = await globSearch({ pattern: 'package.json' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('package.json')
  })

  it('respects maxResults limit', async () => {
    const result = await globSearch({ pattern: '**/*.ts', maxResults: 2 }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    const lines = result.output.split('\n').filter(l => l.trim() && !l.includes('results shown'))
    expect(lines.length).toBeLessThanOrEqual(2)
  })

  it('handles custom cwd on the input', async () => {
    const result = await globSearch({ pattern: '*.ts', cwd: join(tmpDir, 'src') })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('index.ts')
  })

  it('skips node_modules directories', async () => {
    await mkdir(join(tmpDir, 'node_modules', 'pkg'), { recursive: true })
    await writeFile({ path: 'node_modules/pkg/index.ts', content: 'hidden' }, { cwd: tmpDir })
    const result = await globSearch({ pattern: '**/*.ts' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).not.toContain('node_modules')
  })
})

// ---------------------------------------------------------------------------
// grepSearch
// ---------------------------------------------------------------------------

describe('grepSearch', () => {
  it('finds matches across all files', async () => {
    const result = await grepSearch({ pattern: 'export' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('index.ts')
    expect(result.output).toContain('utils.ts')
  })

  it('returns "No matches found." when pattern has no matches', async () => {
    const result = await grepSearch({ pattern: 'XXXXXXXX_NOT_IN_ANY_FILE' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toBe('No matches found.')
  })

  it('supports filePattern to limit file types', async () => {
    const result = await grepSearch({ pattern: '#', filePattern: '*.md' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('README.md')
    expect(result.output).not.toContain('index.ts')
  })

  it('supports case-insensitive matching', async () => {
    const result = await grepSearch({ pattern: 'project', ignoreCase: true }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toContain('README.md')
  })

  it('returns isError=true for invalid regex', async () => {
    const result = await grepSearch({ pattern: '[invalid(regex' }, { cwd: tmpDir })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Invalid regex')
  })

  it('includes context lines when before/after specified', async () => {
    const result = await grepSearch(
      { pattern: 'TODO', after: 1 },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(false)
    expect(result.output).toContain('TODO')
  })

  it('searches a specific file when path is given', async () => {
    const result = await grepSearch(
      { pattern: 'export', path: 'src/index.ts' },
      { cwd: tmpDir },
    )
    expect(result.isError).toBe(false)
    expect(result.output).toContain('index.ts')
    // Should NOT match utils.ts even though it has 'export'
    expect(result.output).not.toContain('utils.ts')
  })

  it('includes line numbers in output', async () => {
    const result = await grepSearch({ pattern: 'const a', filePattern: '*.ts' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    // Format: file:lineNum: content
    expect(result.output).toMatch(/:\d+:/)
  })

  it('skips node_modules directories', async () => {
    await mkdir(join(tmpDir, 'node_modules', 'pkg'), { recursive: true })
    await writeFile({ path: 'node_modules/pkg/index.ts', content: 'export const hidden = 1;' }, { cwd: tmpDir })
    const result = await grepSearch({ pattern: 'hidden' }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    expect(result.output).toBe('No matches found.')
  })

  it('respects maxMatches limit', async () => {
    const result = await grepSearch({ pattern: '.', maxMatches: 2 }, { cwd: tmpDir })
    expect(result.isError).toBe(false)
    const matchLines = result.output.split('\n').filter(l => l.match(/:\d+:/))
    expect(matchLines.length).toBeLessThanOrEqual(2)
  })
})
