/**
 * FreeCodeClient — high-level Node.js client for the free-code agent.
 *
 * Wraps the `query()` subprocess interface in a convenient class with:
 * - `query()` — streaming async generator (yields SDKMessages)
 * - `runQuery()` — one-shot helper that collects messages and returns the final result
 * - Persistent options (model, cwd, maxTurns, etc.) set at construction time
 *
 * Provider selection (Anthropic / Bedrock / Vertex / Foundry / OpenAI) is
 * handled by the free-code CLI itself via the same environment variables as
 * the CLI — no reimplementation needed.
 *
 * @example
 * ```ts
 * // Direct Anthropic API (default — set ANTHROPIC_API_KEY)
 * const client = createClient({ cwd: '/my/project' })
 *
 * // AWS Bedrock: set CLAUDE_CODE_USE_BEDROCK=1, AWS_REGION, AWS_PROFILE
 * // Google Vertex: set CLAUDE_CODE_USE_VERTEX=1, ANTHROPIC_VERTEX_PROJECT_ID
 * // OpenAI: set CLAUDE_CODE_USE_OPENAI=1, OPENAI_API_KEY
 *
 * // Streaming
 * for await (const msg of client.query('List all TypeScript files')) {
 *   if (msg.type === 'assistant') {
 *     for (const block of msg.message?.content ?? []) {
 *       if (typeof block === 'object' && block !== null && 'type' in block) {
 *         if (block.type === 'text') process.stdout.write((block as {text:string}).text)
 *       }
 *     }
 *   }
 * }
 *
 * // One-shot
 * const result = await client.runQuery('Summarize the README')
 * console.log(result.result)
 * console.log('Cost:', result.totalCostUSD)
 * ```
 */

import { query as queryStream } from './query.js'
import type { SDKMessage, SDKResultMessage } from '../entrypoints/agentSdkTypes.js'
import type { QueryOptions, RunQueryResult } from './types.js'

export class FreeCodeClient {
  private readonly defaults: QueryOptions

  constructor(defaults: QueryOptions = {}) {
    this.defaults = defaults
  }

  /**
   * Stream the agent's response for `prompt`.
   *
   * Yields each `SDKMessage` from the free-code CLI in real time.
   * The stream ends with a `{type: 'result'}` message.
   */
  query(prompt: string, opts?: QueryOptions): AsyncGenerator<SDKMessage> {
    return queryStream(prompt, { ...this.defaults, ...opts })
  }

  /**
   * Run a query and wait for the final result.
   *
   * Collects all messages and returns them together with the extracted
   * result string, cost, session ID, etc.
   */
  async runQuery(prompt: string, opts?: QueryOptions): Promise<RunQueryResult> {
    const messages: SDKMessage[] = []
    let resultMsg: SDKResultMessage | undefined

    for await (const msg of this.query(prompt, opts)) {
      messages.push(msg)
      if (msg.type === 'result') {
        resultMsg = msg as SDKResultMessage
      }
    }

    return {
      result: resultMsg?.result ?? '',
      isError: resultMsg?.is_error ?? false,
      messages,
      totalCostUSD: resultMsg?.total_cost_usd,
      durationMs: resultMsg?.duration_ms,
      numTurns: resultMsg?.['num_turns'] as number | undefined,
      sessionId: resultMsg?.session_id,
    }
  }
}

/**
 * Create a `FreeCodeClient` with the given default options.
 *
 * @example
 * ```ts
 * const client = createClient({
 *   cwd: '/workspace',
 *   dangerouslySkipPermissions: true,
 *   maxTurns: 20,
 * })
 * const result = await client.runQuery('Fix the TypeScript errors')
 * ```
 */
export function createClient(opts?: QueryOptions): FreeCodeClient {
  return new FreeCodeClient(opts)
}
