/**
 * Public entry point for the free-code Node.js library.
 *
 * Import as:
 * ```ts
 * import {
 *   query, createClient, FreeCodeClient,
 *   resolveBin, PACKAGE_ROOT,
 * } from '@easy-sysml/free-code/node'
 * ```
 *
 * ## Provider selection
 *
 * The free-code CLI auto-selects the AI provider from environment variables —
 * identical to the CLI experience. No reimplementation needed.
 *
 * | Provider       | Environment variable              |
 * |----------------|-----------------------------------|
 * | Anthropic API  | `ANTHROPIC_API_KEY` (default)     |
 * | AWS Bedrock    | `CLAUDE_CODE_USE_BEDROCK=1`       |
 * | Google Vertex  | `CLAUDE_CODE_USE_VERTEX=1`        |
 * | Anthropic Foundry | `CLAUDE_CODE_USE_FOUNDRY=1`    |
 * | OpenAI-compatible | `CLAUDE_CODE_USE_OPENAI=1`     |
 *
 * ## Available tools (provided by free-code CLI)
 *
 * All tools from the free-code CLI are available automatically:
 * - **Bash** — shell command execution
 * - **Read / Write / Edit** — file operations
 * - **Glob / Grep** — file search
 * - **WebFetch** — HTTP fetch with caching
 * - **TodoRead / TodoWrite** — Memory & Planning (task list)
 * - **Agent** — sub-agent spawning (Agents feature)
 * - All MCP tools configured in the project
 *
 * @module @easy-sysml/free-code/node
 */

// Core query function (streaming)
export { query } from './query.js'

// High-level client
export { FreeCodeClient, createClient } from './client.js'

// Binary discovery utilities
export { resolveBin, PACKAGE_ROOT } from './utils.js'
export type { ResolvedBin, BinMode } from './utils.js'

// All SDK message types (re-exported from free-code's agentSdkTypes)
export type {
  SDKMessage,
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKStatusMessage,
  SDKToolProgressMessage,
  SDKPermissionDenial,
  SDKUserMessage,
  SDKUserMessageReplay,
  SDKCompactBoundaryMessage,
  SDKBaseMessage,
  SDKStatus,
  ModelUsage,
  PermissionMode,
  PermissionResult,
} from './types.js'

// Client-specific types
export type { QueryOptions, RunQueryResult } from './types.js'
