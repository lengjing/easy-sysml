/**
 * Core query function — spawns the free-code CLI with `-p --output-format stream-json`
 * and yields typed SDK messages as they arrive.
 *
 * This is the same interface that the official Claude Code Python SDK uses:
 * it spawns the CLI subprocess and reads its NDJSON output line by line.
 *
 * All built-in tools (Bash, Read, Write, Edit, Glob, Grep, WebFetch, TodoWrite,
 * memory, agents, planning) are provided by the free-code CLI itself — no
 * reimplementation needed.
 *
 * @example
 * ```ts
 * for await (const msg of query('List all TypeScript files')) {
 *   if (msg.type === 'assistant') console.log(msg.message?.content)
 *   if (msg.type === 'result') console.log('Done:', msg.result)
 * }
 * ```
 */

import { spawn } from 'child_process'
import { createInterface } from 'readline'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import { resolveBin } from './utils.js'
import type { QueryOptions } from './types.js'

// ---------------------------------------------------------------------------
// Build CLI argv from QueryOptions
// ---------------------------------------------------------------------------

function buildArgs(prompt: string, opts: QueryOptions): string[] {
  const args: string[] = []

  // Core: headless print mode + structured JSON output
  args.push('-p', prompt)
  args.push('--output-format', 'stream-json')

  if (opts.model) args.push('--model', opts.model)
  if (opts.maxTurns !== undefined) args.push('--max-turns', String(opts.maxTurns))
  if (opts.maxBudgetUSD !== undefined) args.push('--max-budget-usd', String(opts.maxBudgetUSD))
  if (opts.dangerouslySkipPermissions) args.push('--dangerously-skip-permissions')
  if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt)
  if (opts.sessionId) args.push('--resume', opts.sessionId)

  return args
}

// ---------------------------------------------------------------------------
// Streaming query
// ---------------------------------------------------------------------------

/**
 * Spawn a free-code query and yield SDK messages as they arrive.
 *
 * The generator yields every `SDKMessage` from the stream, including:
 * - `{type: 'system'}` — init message with tool list, session info
 * - `{type: 'assistant'}` — model responses (text, tool_use blocks)
 * - `{type: 'tool_progress'}` — progress updates while tools run
 * - `{type: 'result'}` — final result with cost/duration/session_id
 *
 * @param prompt  The user prompt to send
 * @param opts    CLI options (cwd, model, maxTurns, env, ...)
 */
export async function* query(
  prompt: string,
  opts: QueryOptions = {},
): AsyncGenerator<SDKMessage> {
  const resolved = resolveBin(opts.binPath)
  const cliArgs = [...resolved.prefixArgs, ...buildArgs(prompt, opts)]

  const env = {
    ...process.env,
    ...(opts.env ?? {}),
  }

  const child = spawn(resolved.bin, cliArgs, {
    cwd: opts.cwd ?? process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Propagate abort signal → kill the child process
  const abortHandler = () => child.kill('SIGTERM')
  opts.signal?.addEventListener('abort', abortHandler)

  const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity })

  const lines: string[] = []
  const errors: string[] = []

  // Collect stderr for error reporting
  child.stderr?.on('data', (chunk: Buffer) => {
    errors.push(chunk.toString())
  })

  try {
    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue
      lines.push(trimmed)

      let msg: SDKMessage
      try {
        msg = JSON.parse(trimmed) as SDKMessage
      } catch {
        // Non-JSON output (e.g. warnings) — skip silently
        continue
      }

      yield msg

      // Stop yielding once we get the final result message
      if (msg.type === 'result') break
    }
  } finally {
    opts.signal?.removeEventListener('abort', abortHandler)
    rl.close()
    child.kill('SIGTERM')
  }

  // Wait for process exit and check for errors
  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', resolve)
  })

  if (exitCode !== 0 && lines.length === 0) {
    const errText = errors.join('').trim()
    throw new Error(
      `free-code process exited with code ${exitCode}` +
        (errText ? `:\n${errText}` : ''),
    )
  }
}
