/**
 * File system tools for the free-code Node.js library.
 *
 * Provides readFile, writeFile, and editFile (line-range replace).
 * Pure Node.js fs/promises — no Bun, no CLI dependencies.
 */

import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  mkdir,
} from 'fs/promises'
import { resolve, dirname } from 'path'
import type { FreeCodeOptions, ToolDefinition, ToolResult } from '../types.js'

/** Maximum characters read back to the model for a single file read. */
const MAX_READ_CHARS = 100_000

// ---------------------------------------------------------------------------
// readFile
// ---------------------------------------------------------------------------

export interface ReadFileInput {
  path: string
  /** 1-based start line (inclusive). Omit to read from the beginning. */
  startLine?: number
  /** 1-based end line (inclusive). Omit to read to the end. */
  endLine?: number
}

/**
 * Read a file from disk, optionally slicing to a line range.
 * Returns lines prefixed with their 1-based line numbers.
 */
export async function readFile(
  input: ReadFileInput,
  options: Pick<FreeCodeOptions, 'cwd'> = {},
): Promise<ToolResult> {
  const absPath = resolve(options.cwd ?? process.cwd(), input.path)
  let content: string
  try {
    content = await fsReadFile(absPath, 'utf-8')
  } catch (err: unknown) {
    return { output: `Cannot read ${input.path}: ${(err as Error).message}`, isError: true }
  }

  const lines = content.split('\n')
  // Special case: truly empty file
  if (content === '') return { output: '(empty file)', isError: false }

  const start = Math.max(1, input.startLine ?? 1)
  const end = Math.min(lines.length, input.endLine ?? lines.length)

  const slice = lines.slice(start - 1, end)
  const numbered = slice
    .map((line, i) => `${String(start + i).padStart(6)} | ${line}`)
    .join('\n')

  const truncated = numbered.length > MAX_READ_CHARS
    ? numbered.slice(0, MAX_READ_CHARS) + '\n… (truncated)'
    : numbered

  return { output: truncated || '(empty file)', isError: false }
}

// ---------------------------------------------------------------------------
// writeFile
// ---------------------------------------------------------------------------

export interface WriteFileInput {
  path: string
  content: string
}

/**
 * Write (create or overwrite) a file.  Creates parent directories as needed.
 */
export async function writeFile(
  input: WriteFileInput,
  options: Pick<FreeCodeOptions, 'cwd'> = {},
): Promise<ToolResult> {
  const absPath = resolve(options.cwd ?? process.cwd(), input.path)
  try {
    await mkdir(dirname(absPath), { recursive: true })
    await fsWriteFile(absPath, input.content, 'utf-8')
    return { output: `Written ${input.path}`, isError: false }
  } catch (err: unknown) {
    return { output: `Cannot write ${input.path}: ${(err as Error).message}`, isError: true }
  }
}

// ---------------------------------------------------------------------------
// editFile (line-range replacement)
// ---------------------------------------------------------------------------

export interface EditFileInput {
  path: string
  /** 1-based start line (inclusive) to replace. */
  startLine: number
  /** 1-based end line (inclusive) to replace. */
  endLine: number
  /** New content that replaces lines [startLine, endLine]. */
  newContent: string
}

/**
 * Replace a range of lines in an existing file.
 *
 * `startLine` and `endLine` are 1-based and inclusive. The lines are replaced
 * with `newContent` (which may contain any number of lines).
 */
export async function editFile(
  input: EditFileInput,
  options: Pick<FreeCodeOptions, 'cwd'> = {},
): Promise<ToolResult> {
  const absPath = resolve(options.cwd ?? process.cwd(), input.path)
  let original: string
  try {
    original = await fsReadFile(absPath, 'utf-8')
  } catch (err: unknown) {
    return { output: `Cannot read ${input.path}: ${(err as Error).message}`, isError: true }
  }

  const lines = original.split('\n')
  const totalLines = lines.length
  const start = input.startLine
  const end = input.endLine

  if (start < 1 || end < start || start > totalLines) {
    return {
      output: `Invalid line range ${start}–${end} (file has ${totalLines} lines)`,
      isError: true,
    }
  }

  const newLines = input.newContent.split('\n')
  const updated = [
    ...lines.slice(0, start - 1),
    ...newLines,
    ...lines.slice(end),
  ]

  try {
    await fsWriteFile(absPath, updated.join('\n'), 'utf-8')
    return {
      output: `Replaced lines ${start}–${end} of ${input.path} with ${newLines.length} line(s)`,
      isError: false,
    }
  } catch (err: unknown) {
    return { output: `Cannot write ${input.path}: ${(err as Error).message}`, isError: true }
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const readFileTool: ToolDefinition = {
  name: 'Read',
  description:
    'Read the contents of a file from disk. Returns lines with 1-based line numbers. ' +
    'Use startLine/endLine to read a specific section. ' +
    'Adapted from free-code\'s FileReadTool (`src/tools/FileReadTool/`).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative to cwd or absolute).' },
      startLine: { type: 'number', description: '1-based start line (inclusive). Omit to read from the start.' },
      endLine: { type: 'number', description: '1-based end line (inclusive). Omit to read to the end.' },
    },
    required: ['path'],
  },
  execute(input, options) {
    return readFile(input as ReadFileInput, options)
  },
}

export const writeFileTool: ToolDefinition = {
  name: 'Write',
  description:
    'Create or overwrite a file with the given content. ' +
    'Parent directories are created automatically. ' +
    'Adapted from free-code\'s FileWriteTool (`src/tools/FileWriteTool/`).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative to cwd or absolute).' },
      content: { type: 'string', description: 'File content to write.' },
    },
    required: ['path', 'content'],
  },
  execute(input, options) {
    return writeFile(input as WriteFileInput, options)
  },
}

export const editFileTool: ToolDefinition = {
  name: 'Edit',
  description:
    'Replace a range of lines in an existing file. ' +
    'startLine and endLine are 1-based and inclusive. ' +
    'The specified line range is replaced with newContent. ' +
    'Adapted from free-code\'s FileEditTool (`src/tools/FileEditTool/`).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative to cwd or absolute).' },
      startLine: { type: 'number', description: '1-based start line (inclusive).' },
      endLine: { type: 'number', description: '1-based end line (inclusive).' },
      newContent: { type: 'string', description: 'Replacement content.' },
    },
    required: ['path', 'startLine', 'endLine', 'newContent'],
  },
  execute(input, options) {
    return editFile(input as EditFileInput, options)
  },
}

// ---------------------------------------------------------------------------
// listDir
// ---------------------------------------------------------------------------

import { readdir } from 'fs/promises'
import { join as joinPath } from 'path'

export interface ListDirInput {
  path?: string
}

/**
 * List directory contents (similar to `ls` / `readdir`).
 * Returns filenames with type indicator (file/dir/symlink).
 */
export async function listDir(
  input: ListDirInput,
  options: FreeCodeOptions = {},
): Promise<ToolResult> {
  const cwd = options.cwd ?? process.cwd()
  const targetPath = resolve(cwd, input.path ?? '.')

  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(targetPath, { withFileTypes: true })
  } catch (err: unknown) {
    return { output: `Error listing directory: ${(err as Error).message}`, isError: true }
  }

  if (entries.length === 0) {
    return { output: `(empty directory: ${targetPath})`, isError: false }
  }

  const lines = entries.map(e => {
    const indicator = e.isDirectory() ? '/' : e.isSymbolicLink() ? '@' : ''
    return `${e.name}${indicator}`
  })

  return { output: lines.join('\n'), isError: false }
}

export const listDirTool: ToolDefinition = {
  name: 'ListDir',
  description:
    'Lists the contents of a directory. ' +
    'Entries ending with / are directories, @ indicates symlinks. ' +
    'Adapted from free-code ls-style tooling.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (relative to cwd or absolute). Defaults to cwd.',
      },
    },
    required: [],
  },
  execute(input, options) {
    return listDir(input as ListDirInput, options)
  },
}
