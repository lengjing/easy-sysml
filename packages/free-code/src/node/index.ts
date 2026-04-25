/**
 * free-code — Node.js library entry point
 *
 * A clean Node.js importable library wrapping free-code's powerful agent
 * capabilities — no React, no Ink, no CLI dependencies.
 *
 * Supports all providers from free-code (via environment variables):
 *   - Anthropic direct API (default, ANTHROPIC_API_KEY)
 *   - AWS Bedrock       (CLAUDE_CODE_USE_BEDROCK=1)
 *   - Google Vertex AI  (CLAUDE_CODE_USE_VERTEX=1)
 *   - Anthropic Foundry (CLAUDE_CODE_USE_FOUNDRY=1)
 *   - OpenAI-compatible (CLAUDE_CODE_USE_OPENAI=1)
 *
 * Built-in tools (adapted from free-code's tool registry):
 *   - Bash           — execute shell commands
 *   - FileRead       — read files with optional line ranges
 *   - FileWrite      — write / create files
 *   - FileEdit       — replace a line range within a file
 *   - ListDir        — list directory contents
 *   - Glob           — recursive file pattern matching
 *   - Grep           — regex search within file contents
 *   - WebFetch       — fetch and parse web pages
 *   - TodoRead       — read the session task list
 *   - TodoWrite      — manage the session task list (Memory & Planning)
 *
 * @example
 * ```ts
 * import { createAgent, runBash, readFile, globSearch } from '@easy-sysml/free-code/node'
 *
 * // One-shot agent query (uses Anthropic API by default)
 * const agent = createAgent({ apiKey: process.env.ANTHROPIC_API_KEY })
 * const result = await agent.runQuery('Summarize the README')
 * console.log(result.result)
 *
 * // AWS Bedrock provider
 * // CLAUDE_CODE_USE_BEDROCK=1 AWS_REGION=us-east-1 node app.js
 * const bedrockAgent = createAgent()
 *
 * // Standalone tool usage
 * const { output } = await runBash({ command: 'git log --oneline -5' })
 * const files = await globSearch({ pattern: '**\/*.ts' })
 * const html = await webFetch({ url: 'https://example.com' })
 * ```
 */

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export { getAPIProvider, getDefaultModel, createAPIClient } from './providers.js'
export type { APIProvider, AnthropicClientLike, CreateClientOptions } from './providers.js'

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export { FreeCodeAgent, createAgent } from './agent.js'

// ---------------------------------------------------------------------------
// Standalone tool functions
// ---------------------------------------------------------------------------

export { runBash } from './tools/bash.js'
export type { BashInput } from './tools/bash.js'

export { readFile, writeFile, editFile, listDir } from './tools/file.js'
export type {
  ReadFileInput,
  WriteFileInput,
  EditFileInput,
  ListDirInput,
} from './tools/file.js'

export { globSearch, grepSearch } from './tools/search.js'
export type { GlobInput, GrepInput } from './tools/search.js'

export { webFetch, clearWebFetchCache } from './tools/web.js'
export type { WebFetchInput, WebFetchOutput } from './tools/web.js'

export { todoRead, todoWrite, getTodos, clearTodos } from './tools/todo.js'
export type { Todo, TodoStatus, TodoPriority, TodoWriteInput } from './tools/todo.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  FreeCodeOptions,
  AgentMessage,
  AgentMessageType,
  TextMessage,
  ToolCallMessage,
  ToolResultMessage,
  UsageMessage,
  ErrorMessage,
  DoneMessage,
  ToolDefinition,
  ToolResult,
  QueryResult,
} from './types.js'
