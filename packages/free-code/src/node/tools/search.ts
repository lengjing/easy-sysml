/**
 * Search tools for the free-code Node.js library.
 *
 * Provides glob (file-name matching) and grep (content search).
 * Pure Node.js — no Bun, no CLI dependencies.
 */

import { readdir, readFile, stat } from 'fs/promises'
import { resolve, relative, join } from 'path'
import type { FreeCodeOptions, ToolDefinition, ToolResult } from '../types.js'

// ---------------------------------------------------------------------------
// glob — recursive file-name pattern matching
// ---------------------------------------------------------------------------

export interface GlobInput {
  pattern: string
  /** Root directory to search. Defaults to cwd. */
  cwd?: string
  /** Maximum number of results. @default 1000 */
  maxResults?: number
}

/**
 * Very simple glob implementation that supports `*`, `**`, and `?` wildcards.
 * `**` matches zero or more path segments (directories).
 * For production use consider the `fast-glob` package; this covers the common
 * cases without adding a dependency.
 */
function matchGlob(pattern: string, path: string): boolean {
  const normPattern = pattern.replace(/\\/g, '/')
  const normPath = path.replace(/\\/g, '/')

  // Escape regex special chars in the pattern (but NOT *, ?, /)
  let regexStr = normPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')

  // Use null-byte placeholders so the single-* replacement in the next step
  // does not clobber the `.*` we embed for **.  Ordering matters: handle
  // multi-char sequences (/**/, /**$, **/) before the bare **.
  regexStr = regexStr
    .replace(/\/\*\*\//g, '\x00A')   // /**/  → zero-or-more dir segments (middle)
    .replace(/\/\*\*$/g, '\x00B')    // /**   → optional trailing path
    .replace(/^\*\*\//g, '\x00C')    // **/   → zero-or-more dir segments (start)
    .replace(/\*\*/g, '\x00D')       // **    → any chars (standalone)
    .replace(/\*/g, '[^/]*')         // *     → any segment chars (no slash)
    .replace(/\?/g, '[^/]')          // ?     → single char (no slash)
    // Expand placeholders now that all * have been consumed
    .replace(/\x00A/g, '/(.*/)?')    // /(**)/ → optional subdir between slashes
    .replace(/\x00B/g, '(/.+)?')     // /** at end
    .replace(/\x00C/g, '(.*/)?')     // **/ at start
    .replace(/\x00D/g, '.*')         // ** standalone

  const regex = new RegExp(`^${regexStr}$`)
  return regex.test(normPath)
}

async function walkDir(
  dir: string,
  rootDir: string,
  pattern: string,
  results: string[],
  maxResults: number,
): Promise<void> {
  if (results.length >= maxResults) return
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (results.length >= maxResults) break
    const full = join(dir, entry.name)
    const rel = relative(rootDir, full)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walkDir(full, rootDir, pattern, results, maxResults)
      }
    } else if (matchGlob(pattern, rel) || matchGlob(pattern, entry.name)) {
      results.push(rel)
    }
  }
}

export async function globSearch(
  input: GlobInput,
  options: Pick<FreeCodeOptions, 'cwd'> = {},
): Promise<ToolResult> {
  const rootDir = resolve(input.cwd ?? options.cwd ?? process.cwd())
  const maxResults = input.maxResults ?? 1_000
  const results: string[] = []

  // Check if pattern starts with a specific directory component
  try {
    await walkDir(rootDir, rootDir, input.pattern, results, maxResults)
  } catch (err: unknown) {
    return { output: `Glob error: ${(err as Error).message}`, isError: true }
  }

  if (results.length === 0) {
    return { output: 'No files matched.', isError: false }
  }
  const output = results.join('\n') +
    (results.length >= maxResults ? `\n… (${maxResults} results shown; refine your pattern)` : '')
  return { output, isError: false }
}

// ---------------------------------------------------------------------------
// grep — recursive content search
// ---------------------------------------------------------------------------

export interface GrepInput {
  pattern: string
  /** Directory or file to search. Defaults to cwd. */
  path?: string
  /** File glob filter, e.g. '*.ts'. Defaults to all files. */
  filePattern?: string
  /** If true, case-insensitive match. @default false */
  ignoreCase?: boolean
  /** Lines of context before match. @default 0 */
  before?: number
  /** Lines of context after match. @default 0 */
  after?: number
  /** Maximum matches to return. @default 500 */
  maxMatches?: number
}

interface GrepMatch {
  file: string
  line: number
  text: string
  context?: { before: string[]; after: string[] }
}

async function grepFile(
  filePath: string,
  regex: RegExp,
  contextBefore: number,
  contextAfter: number,
  matches: GrepMatch[],
  maxMatches: number,
  rootDir: string,
): Promise<void> {
  if (matches.length >= maxMatches) return
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return
  }
  const lines = content.split('\n')
  const rel = relative(rootDir, filePath)
  for (let i = 0; i < lines.length; i++) {
    if (matches.length >= maxMatches) break
    if (regex.test(lines[i])) {
      matches.push({
        file: rel,
        line: i + 1,
        text: lines[i],
        context: contextBefore > 0 || contextAfter > 0
          ? {
              before: lines.slice(Math.max(0, i - contextBefore), i),
              after: lines.slice(i + 1, i + 1 + contextAfter),
            }
          : undefined,
      })
    }
  }
}

async function walkDirForGrep(
  dir: string,
  rootDir: string,
  regex: RegExp,
  filePattern: string | undefined,
  contextBefore: number,
  contextAfter: number,
  matches: GrepMatch[],
  maxMatches: number,
): Promise<void> {
  if (matches.length >= maxMatches) return
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (matches.length >= maxMatches) break
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walkDirForGrep(full, rootDir, regex, filePattern, contextBefore, contextAfter, matches, maxMatches)
      }
    } else {
      if (!filePattern || matchGlob(filePattern, entry.name)) {
        await grepFile(full, regex, contextBefore, contextAfter, matches, maxMatches, rootDir)
      }
    }
  }
}

export async function grepSearch(
  input: GrepInput,
  options: Pick<FreeCodeOptions, 'cwd'> = {},
): Promise<ToolResult> {
  const cwd = options.cwd ?? process.cwd()
  const targetPath = resolve(cwd, input.path ?? '.')
  const maxMatches = input.maxMatches ?? 500
  const contextBefore = input.before ?? 0
  const contextAfter = input.after ?? 0

  let regex: RegExp
  try {
    regex = new RegExp(input.pattern, input.ignoreCase ? 'i' : '')
  } catch (err: unknown) {
    return { output: `Invalid regex: ${(err as Error).message}`, isError: true }
  }

  const matches: GrepMatch[] = []
  try {
    const s = await stat(targetPath)
    if (s.isFile()) {
      await grepFile(targetPath, regex, contextBefore, contextAfter, matches, maxMatches, cwd)
    } else {
      await walkDirForGrep(targetPath, cwd, regex, input.filePattern, contextBefore, contextAfter, matches, maxMatches)
    }
  } catch (err: unknown) {
    return { output: `Grep error: ${(err as Error).message}`, isError: true }
  }

  if (matches.length === 0) {
    return { output: 'No matches found.', isError: false }
  }

  const lines: string[] = []
  for (const m of matches) {
    if (m.context?.before.length) {
      for (let i = 0; i < m.context.before.length; i++) {
        const lineNum = m.line - m.context.before.length + i
        lines.push(`${m.file}:${lineNum}- ${m.context.before[i]}`)
      }
    }
    lines.push(`${m.file}:${m.line}: ${m.text}`)
    if (m.context?.after.length) {
      for (let i = 0; i < m.context.after.length; i++) {
        lines.push(`${m.file}:${m.line + 1 + i}+ ${m.context.after[i]}`)
      }
    }
    lines.push('--')
  }

  const output = lines.join('\n') +
    (matches.length >= maxMatches ? `\n… (${maxMatches} matches shown; refine your pattern)` : '')
  return { output, isError: false }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const globTool: ToolDefinition = {
  name: 'Glob',
  description:
    'Find files matching a glob pattern recursively in the project. ' +
    'Supports * (any chars in segment), ** (any path), ? (single char). ' +
    'Skips hidden directories and node_modules. ' +
    'Adapted from free-code\'s GlobTool (`src/tools/GlobTool/`).',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts" or "src/*.tsx".' },
      cwd: { type: 'string', description: 'Root directory for the search. Defaults to agent cwd.' },
      maxResults: { type: 'number', description: 'Maximum number of results. Default 1000.' },
    },
    required: ['pattern'],
  },
  execute(input, options) {
    return globSearch(input as GlobInput, options)
  },
}

export const grepTool: ToolDefinition = {
  name: 'Grep',
  description:
    'Search file contents using a regular expression. ' +
    'Skips hidden directories and node_modules. ' +
    'Use filePattern to limit to specific file types (e.g. "*.ts"). ' +
    'Adapted from free-code\'s GrepTool (`src/tools/GrepTool/`).',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regular expression to search for.' },
      path: { type: 'string', description: 'File or directory to search. Defaults to cwd.' },
      filePattern: { type: 'string', description: 'Glob pattern to filter files, e.g. "*.ts".' },
      ignoreCase: { type: 'boolean', description: 'Case-insensitive match. Default false.' },
      before: { type: 'number', description: 'Lines of context before match. Default 0.' },
      after: { type: 'number', description: 'Lines of context after match. Default 0.' },
      maxMatches: { type: 'number', description: 'Maximum matches to return. Default 500.' },
    },
    required: ['pattern'],
  },
  execute(input, options) {
    return grepSearch(input as GrepInput, options)
  },
}
