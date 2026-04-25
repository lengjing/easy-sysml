/**
 * FreeCodeAgent — the core Node.js agent class for free-code.
 *
 * Wraps the multi-provider Anthropic SDK (Anthropic direct, AWS Bedrock,
 * Google Vertex AI, Anthropic Foundry, OpenAI-compatible) with a powerful
 * tool-calling agentic loop.  Provider selection mirrors free-code's own
 * environment-variable-based approach from `src/utils/model/providers.ts`.
 *
 * No React, no Ink, no CLI dependencies — pure Node.js.
 *
 * @example
 * ```ts
 * // Direct Anthropic API (default)
 * const agent = createAgent({ apiKey: process.env.ANTHROPIC_API_KEY })
 *
 * // AWS Bedrock
 * // CLAUDE_CODE_USE_BEDROCK=1 AWS_REGION=us-east-1 node app.js
 * const agent = createAgent()
 *
 * // Google Vertex AI
 * // CLAUDE_CODE_USE_VERTEX=1 ANTHROPIC_VERTEX_PROJECT_ID=my-project node app.js
 * const agent = createAgent()
 *
 * // Streaming
 * for await (const msg of agent.query('List all TypeScript files in src/')) {
 *   if (msg.type === 'text') process.stdout.write(msg.text)
 *   if (msg.type === 'done') console.log('\nCost:', msg.usage.costUSD)
 * }
 *
 * // One-shot
 * const result = await agent.runQuery('Summarize the README')
 * console.log(result.result)
 * ```
 */

import type {
  AgentMessage,
  FreeCodeOptions,
  QueryResult,
  ToolDefinition,
  ToolResult,
} from './types.js'
import { bashTool } from './tools/bash.js'
import { readFileTool, writeFileTool, editFileTool, listDirTool } from './tools/file.js'
import { globTool, grepTool } from './tools/search.js'
import { webFetchTool } from './tools/web.js'
import { todoReadTool, todoWriteTool } from './tools/todo.js'
import {
  createAPIClient,
  getAPIProvider,
  getDefaultModel,
  type AnthropicClientLike,
} from './providers.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TURNS = 10
const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI coding assistant with access to a powerful set of tools. ' +
  'You can run bash commands, read/write/edit files, search the codebase, fetch web pages, ' +
  'and manage tasks. Use these tools systematically to help the user accomplish their goals. ' +
  'Plan your approach before taking actions, verify results, and be concise in responses.'

/** All built-in tools adapted from free-code tool registry */
const BUILTIN_TOOLS: ToolDefinition[] = [
  bashTool,       // BashTool equivalent
  readFileTool,   // FileReadTool equivalent
  writeFileTool,  // FileWriteTool equivalent
  editFileTool,   // FileEditTool equivalent
  listDirTool,    // ls / directory listing
  globTool,       // GlobTool equivalent
  grepTool,       // GrepTool equivalent
  webFetchTool,   // WebFetchTool equivalent
  todoReadTool,   // TodoReadTool equivalent
  todoWriteTool,  // TodoWriteTool equivalent
]

// ---------------------------------------------------------------------------
// Cost estimation (rough, based on public Anthropic pricing)
// ---------------------------------------------------------------------------

const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
}

function estimateCost(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): number {
  const priceKey =
    Object.keys(PRICE_PER_MILLION).find(k => model.startsWith(k)) ?? ''
  const price = PRICE_PER_MILLION[priceKey] ?? { input: 3, output: 15 }
  const inputCost = ((usage.input_tokens ?? 0) / 1_000_000) * price.input
  const outputCost = ((usage.output_tokens ?? 0) / 1_000_000) * price.output
  return inputCost + outputCost
}

// ---------------------------------------------------------------------------
// FreeCodeAgent
// ---------------------------------------------------------------------------

export class FreeCodeAgent {
  private clientPromise: Promise<AnthropicClientLike> | null = null
  private readonly options: FreeCodeOptions & {
    model: string
    cwd: string
    maxTurns: number
    systemPrompt: string
  }
  private readonly tools: Map<string, ToolDefinition>

  constructor(options: FreeCodeOptions = {}) {
    const provider = getAPIProvider()

    this.options = {
      ...options,
      model: options.model ?? getDefaultModel(provider),
      cwd: options.cwd ?? process.cwd(),
      maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
      systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    }

    this.tools = new Map()
    for (const tool of BUILTIN_TOOLS) {
      this.tools.set(tool.name, tool)
    }
  }

  /** Returns the active API provider name (mirrors free-code's getAPIProvider) */
  get provider() {
    return getAPIProvider()
  }

  /** Returns the effective model name */
  get model() {
    return this.options.model
  }

  /** Lazily creates (and caches) the provider-specific SDK client */
  private getClient(): Promise<AnthropicClientLike> {
    if (!this.clientPromise) {
      this.clientPromise = createAPIClient({
        apiKey: this.options.apiKey,
      })
    }
    return this.clientPromise
  }

  /** Register a custom tool (overrides any built-in with the same name). */
  registerTool(tool: ToolDefinition): this {
    this.tools.set(tool.name, tool)
    return this
  }

  /** Remove a tool by name (e.g. to disable bash for sandboxed usage). */
  removeTool(name: string): this {
    this.tools.delete(name)
    return this
  }

  /** Returns a snapshot of all currently registered tool names */
  getToolNames(): string[] {
    return [...this.tools.keys()]
  }

  // -------------------------------------------------------------------------
  // Streaming query
  // -------------------------------------------------------------------------

  /**
   * Run an agentic query and stream messages as an AsyncGenerator.
   *
   * Yields:
   *  - `text` messages for each text chunk
   *  - `tool_call` when the model requests a tool
   *  - `tool_result` after each tool execution
   *  - `usage` with accumulated token/cost info
   *  - `done` when the agent finishes
   *  - `error` on failure
   */
  async *query(
    prompt: string,
    queryOptions: Partial<FreeCodeOptions> = {},
  ): AsyncGenerator<AgentMessage> {
    const opts = { ...this.options, ...queryOptions }
    const client = await this.getClient()

    // Support conversation history via initialMessages option
    const messages: Array<{ role: string; content: unknown }> = [
      ...(opts.initialMessages ?? []),
      { role: 'user', content: prompt },
    ]

    const anthropicTools = [...this.tools.values()].map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }))

    let turnCount = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCacheReadTokens = 0
    let totalCacheCreationTokens = 0
    let totalCostUSD = 0

    while (turnCount < opts.maxTurns) {
      turnCount++
      let response: {
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
        usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
        stop_reason?: string
      }

      try {
        response = await (client.messages.create as (params: Record<string, unknown>) => Promise<typeof response>)({
          model: opts.model,
          max_tokens: 8192,
          system: opts.systemPrompt,
          messages,
          tools: anthropicTools,
        })
      } catch (err: unknown) {
        yield { type: 'error', message: (err as Error).message }
        return
      }

      // Accumulate usage
      const u = response.usage
      totalInputTokens += u.input_tokens
      totalOutputTokens += u.output_tokens
      totalCacheReadTokens += u.cache_read_input_tokens ?? 0
      totalCacheCreationTokens += u.cache_creation_input_tokens ?? 0
      const turnCost = estimateCost(opts.model, u)
      totalCostUSD += turnCost

      yield {
        type: 'usage',
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
        costUSD: turnCost,
      }

      // Process content blocks
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = []
      let hasText = false
      let lastText = ''

      for (const block of response.content) {
        if (block.type === 'text') {
          hasText = true
          lastText = block.text ?? ''
          yield { type: 'text', text: lastText }
        } else if (block.type === 'tool_use') {
          const toolInput = (block.input as Record<string, unknown>) ?? {}
          yield {
            type: 'tool_call',
            toolName: block.name ?? '',
            toolUseId: block.id ?? '',
            input: toolInput,
          }

          // Execute tool
          const toolDef = this.tools.get(block.name ?? '')
          let toolResult: ToolResult
          if (!toolDef) {
            toolResult = {
              output: `Unknown tool: ${block.name}`,
              isError: true,
            }
          } else {
            try {
              toolResult = await toolDef.execute(toolInput, opts)
            } catch (err: unknown) {
              toolResult = {
                output: `Tool error: ${(err as Error).message}`,
                isError: true,
              }
            }
          }

          yield {
            type: 'tool_result',
            toolName: block.name ?? '',
            toolUseId: block.id ?? '',
            output: toolResult.output,
            isError: toolResult.isError,
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id ?? '',
            content: toolResult.output,
            is_error: toolResult.isError,
          })
        }
      }

      // If there were tool calls, continue agentic loop
      if (toolResults.length > 0) {
        messages.push({ role: 'assistant', content: response.content })
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // No tool calls — agent is done
      const finalText = hasText ? lastText : ''
      const totalUsage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheCreationTokens: totalCacheCreationTokens,
        costUSD: totalCostUSD,
      }
      yield { type: 'done', result: finalText, usage: totalUsage, turnCount }
      return
    }

    // Hit maxTurns
    const totalUsage = {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      cacheCreationTokens: totalCacheCreationTokens,
      costUSD: totalCostUSD,
    }
    yield {
      type: 'error',
      message: `Agent stopped after ${opts.maxTurns} turns without completing.`,
    }
    yield { type: 'done', result: '', usage: totalUsage, turnCount: opts.maxTurns }
  }

  // -------------------------------------------------------------------------
  // Non-streaming query
  // -------------------------------------------------------------------------

  /**
   * Run an agentic query and return the final result.
   * Collects all streaming messages and returns when done or on error.
   */
  async runQuery(
    prompt: string,
    queryOptions: Partial<FreeCodeOptions> = {},
  ): Promise<QueryResult> {
    for await (const msg of this.query(prompt, queryOptions)) {
      if (msg.type === 'done') {
        return {
          result: msg.result,
          turnCount: msg.turnCount,
          usage: msg.usage,
        }
      }
      if (msg.type === 'error') {
        throw new Error(msg.message)
      }
    }
    throw new Error('Agent completed without yielding a done message')
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `FreeCodeAgent` instance with the given options.
 *
 * Provider is chosen by environment variables (same as free-code CLI):
 * - Default: Anthropic direct API (`ANTHROPIC_API_KEY`)
 * - `CLAUDE_CODE_USE_BEDROCK=1`: AWS Bedrock
 * - `CLAUDE_CODE_USE_VERTEX=1`: Google Vertex AI
 * - `CLAUDE_CODE_USE_FOUNDRY=1`: Anthropic Foundry
 * - `CLAUDE_CODE_USE_OPENAI=1`: OpenAI-compatible endpoint
 */
export function createAgent(options: FreeCodeOptions = {}): FreeCodeAgent {
  return new FreeCodeAgent(options)
}
