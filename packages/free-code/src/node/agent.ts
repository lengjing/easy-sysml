/**
 * FreeCodeAgent — the core Node.js agent class for free-code.
 *
 * Wraps the Anthropic SDK with a tool-calling agentic loop. No React, no Ink,
 * no CLI dependencies.  All tools are pure Node.js.
 *
 * @example
 * ```ts
 * import { FreeCodeAgent } from '@easy-sysml/free-code/node'
 *
 * const agent = new FreeCodeAgent({ apiKey: process.env.ANTHROPIC_API_KEY })
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

import Anthropic from '@anthropic-ai/sdk'
import type {
  MessageParam,
  Tool,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlockParam,
  Usage,
} from '@anthropic-ai/sdk/resources/messages.mjs'
import type {
  AgentMessage,
  FreeCodeOptions,
  QueryResult,
  ToolDefinition,
  ToolResult,
} from './types.js'
import { bashTool } from './tools/bash.js'
import { readFileTool, writeFileTool, editFileTool } from './tools/file.js'
import { globTool, grepTool } from './tools/search.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_TURNS = 10
const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI coding assistant. ' +
  'You have access to tools that let you run bash commands, read/write files, and search the codebase. ' +
  'Use them to help the user accomplish their goals. ' +
  'Be concise and precise in your responses.'

const BUILTIN_TOOLS: ToolDefinition[] = [
  bashTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
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

function estimateCost(model: string, usage: Usage): number {
  const priceKey = Object.keys(PRICE_PER_MILLION).find(k => model.startsWith(k)) ?? ''
  const price = PRICE_PER_MILLION[priceKey] ?? { input: 3, output: 15 }
  const inputCost = ((usage.input_tokens ?? 0) / 1_000_000) * price.input
  const outputCost = ((usage.output_tokens ?? 0) / 1_000_000) * price.output
  return inputCost + outputCost
}

// ---------------------------------------------------------------------------
// FreeCodeAgent
// ---------------------------------------------------------------------------

export class FreeCodeAgent {
  private readonly client: Anthropic
  private readonly options: Required<Pick<FreeCodeOptions, 'model' | 'cwd' | 'maxTurns' | 'systemPrompt' | 'dangerouslySkipPermissions'>> & FreeCodeOptions
  private readonly tools: Map<string, ToolDefinition>

  constructor(options: FreeCodeOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey ?? process.env['ANTHROPIC_API_KEY'],
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    })

    this.options = {
      ...options,
      model: options.model ?? DEFAULT_MODEL,
      cwd: options.cwd ?? process.cwd(),
      maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
      systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      dangerouslySkipPermissions: options.dangerouslySkipPermissions ?? false,
    }

    this.tools = new Map()
    for (const tool of BUILTIN_TOOLS) {
      this.tools.set(tool.name, tool)
    }
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
    const messages: MessageParam[] = [{ role: 'user', content: prompt }]
    const anthropicTools: Tool[] = [...this.tools.values()].map(t => ({
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
      let response: Awaited<ReturnType<typeof this.client.messages.create>>
      try {
        response = await this.client.messages.create({
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

      // Yield usage for this turn
      yield {
        type: 'usage',
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
        costUSD: turnCost,
      }

      // Process content blocks
      const toolResults: ToolResultBlockParam[] = []
      let hasText = false
      let lastText = ''

      for (const block of response.content) {
        if (block.type === 'text') {
          hasText = true
          lastText = block.text
          yield { type: 'text', text: block.text }
        } else if (block.type === 'tool_use') {
          const toolUseBlock = block as ToolUseBlock
          const toolInput = toolUseBlock.input as Record<string, unknown>
          yield {
            type: 'tool_call',
            toolName: toolUseBlock.name,
            toolUseId: toolUseBlock.id,
            input: toolInput,
          }

          // Execute tool
          const toolDef = this.tools.get(toolUseBlock.name)
          let toolResult: ToolResult
          if (!toolDef) {
            toolResult = {
              output: `Unknown tool: ${toolUseBlock.name}`,
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
            toolName: toolUseBlock.name,
            toolUseId: toolUseBlock.id,
            output: toolResult.output,
            isError: toolResult.isError,
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: toolResult.output,
            is_error: toolResult.isError,
          })
        }
      }

      // If there were tool calls, add assistant message + tool results and continue loop
      if (toolResults.length > 0) {
        messages.push({ role: 'assistant', content: response.content as ContentBlock[] })
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
 * Convenience wrapper so callers don't need `new`.
 */
export function createAgent(options: FreeCodeOptions = {}): FreeCodeAgent {
  return new FreeCodeAgent(options)
}
