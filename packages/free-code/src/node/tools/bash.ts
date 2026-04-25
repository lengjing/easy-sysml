/**
 * Bash execution tool for the free-code Node.js library.
 *
 * Executes shell commands in a child process. Does NOT use Bun.spawnSync or
 * any CLI-specific helpers — pure Node.js child_process API.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolve } from 'path'
import type { FreeCodeOptions, ToolDefinition, ToolResult } from '../types.js'

const execFileAsync = promisify(execFile)

/** Maximum output length returned to the model (characters). */
const MAX_OUTPUT_CHARS = 50_000

/** Default timeout for bash commands (milliseconds). */
const DEFAULT_TIMEOUT_MS = 120_000

export interface BashInput {
  command: string
  /** Working directory for the command (defaults to options.cwd). */
  cwd?: string
  /** Timeout in milliseconds. Defaults to 120 000 ms. */
  timeout?: number
}

/**
 * Execute a bash command and return the combined stdout/stderr output.
 */
export async function runBash(
  input: BashInput,
  options: Pick<FreeCodeOptions, 'cwd'> = {},
): Promise<ToolResult> {
  const cwd = resolve(input.cwd ?? options.cwd ?? process.cwd())
  const timeout = input.timeout ?? DEFAULT_TIMEOUT_MS

  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-c', input.command], {
      cwd,
      timeout,
      maxBuffer: MAX_OUTPUT_CHARS * 4, // bytes
      env: process.env,
    })
    const combined = [stdout, stderr].filter(Boolean).join('\n').trim()
    const output = combined.length > MAX_OUTPUT_CHARS
      ? combined.slice(0, MAX_OUTPUT_CHARS) + '\n… (truncated)'
      : combined
    return { output: output || '(no output)', isError: false }
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string
      stderr?: string
      killed?: boolean
      code?: string | number
    }
    if (e.killed) {
      return {
        output: `Command timed out after ${timeout}ms: ${input.command}`,
        isError: true,
      }
    }
    const combined = [e.stdout, e.stderr].filter(Boolean).join('\n').trim()
    const exitInfo = e.code !== undefined ? ` (exit ${e.code})` : ''
    const output = combined
      ? combined.length > MAX_OUTPUT_CHARS
        ? combined.slice(0, MAX_OUTPUT_CHARS) + '\n… (truncated)'
        : combined
      : `${e.message}${exitInfo}`
    return { output: output || `Command failed${exitInfo}`, isError: true }
  }
}

// ---------------------------------------------------------------------------
// Tool definition (used by FreeCodeAgent)
// ---------------------------------------------------------------------------

export const bashTool: ToolDefinition = {
  name: 'bash',
  description:
    'Execute a shell command in a bash process. Returns stdout and stderr combined. ' +
    'Use for running scripts, building projects, running tests, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute.',
      },
      cwd: {
        type: 'string',
        description: 'Optional working directory. Defaults to the agent cwd.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds. Defaults to 120 000.',
      },
    },
    required: ['command'],
  },
  execute(input, options) {
    return runBash(input as BashInput, options)
  },
}
