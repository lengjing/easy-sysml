/**
 * Shared TypeScript types for the free-code Node.js library.
 *
 * These types mirror the SDK message shapes from agentSdkTypes.ts but are
 * kept self-contained so the node library has no dependency on the CLI code.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FreeCodeOptions {
  /** Anthropic API key. Defaults to ANTHROPIC_API_KEY env var. */
  apiKey?: string
  /**
   * Model ID to use.
   * @default 'claude-sonnet-4-6'
   */
  model?: string
  /**
   * Working directory for file/bash tool calls.
   * @default process.cwd()
   */
  cwd?: string
  /**
   * Maximum number of agentic turns before stopping.
   * @default 10
   */
  maxTurns?: number
  /**
   * Base URL for the Anthropic API (useful for OpenAI-compatible proxies).
   * Defaults to the Anthropic SDK default.
   */
  baseURL?: string
  /**
   * System prompt override.  When omitted a minimal default is used.
   */
  systemPrompt?: string
  /**
   * If true, run tools with `dangerouslySkipPermissions` — no confirmation
   * prompts (suitable for server-side automated use).
   * @default false
   */
  dangerouslySkipPermissions?: boolean
}

// ---------------------------------------------------------------------------
// Streaming message types (mirrors SDK shape)
// ---------------------------------------------------------------------------

export type AgentMessageType =
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'usage'
  | 'error'
  | 'done'

export interface TextMessage {
  type: 'text'
  text: string
}

export interface ToolCallMessage {
  type: 'tool_call'
  toolName: string
  toolUseId: string
  input: Record<string, unknown>
}

export interface ToolResultMessage {
  type: 'tool_result'
  toolName: string
  toolUseId: string
  output: string
  isError: boolean
}

export interface UsageMessage {
  type: 'usage'
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUSD: number
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export interface DoneMessage {
  type: 'done'
  result: string
  usage: Omit<UsageMessage, 'type'>
  turnCount: number
}

export type AgentMessage =
  | TextMessage
  | ToolCallMessage
  | ToolResultMessage
  | UsageMessage
  | ErrorMessage
  | DoneMessage

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute(input: Record<string, unknown>, options: FreeCodeOptions): Promise<ToolResult>
}

export interface ToolResult {
  output: string
  isError: boolean
}

// ---------------------------------------------------------------------------
// Query result (non-streaming)
// ---------------------------------------------------------------------------

export interface QueryResult {
  /** Final text output from the agent */
  result: string
  /** Number of agentic turns taken */
  turnCount: number
  /** Token/cost usage */
  usage: Omit<UsageMessage, 'type'>
}
