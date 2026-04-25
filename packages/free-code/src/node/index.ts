/**
 * free-code — Node.js library entry point
 *
 * A clean, dependency-free (no React/Ink/CLI) Node.js agent library that
 * wraps the Anthropic SDK with a tool-calling agentic loop plus common
 * filesystem and shell tools.
 *
 * @example
 * ```ts
 * import { createAgent, runBash, readFile, globSearch } from '@easy-sysml/free-code/node'
 *
 * // One-shot agent query
 * const agent = createAgent({ apiKey: '...' })
 * const result = await agent.runQuery('Add a docstring to every exported function in src/')
 * console.log(result.result)
 *
 * // Standalone tool usage
 * const { output } = await runBash({ command: 'git log --oneline -5' })
 * const files = await globSearch({ pattern: '**\/*.ts' })
 * ```
 */

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export { FreeCodeAgent, createAgent } from './agent.js'

// ---------------------------------------------------------------------------
// Standalone tool functions
// ---------------------------------------------------------------------------

export { runBash } from './tools/bash.js'
export type { BashInput } from './tools/bash.js'

export { readFile, writeFile, editFile } from './tools/file.js'
export type { ReadFileInput, WriteFileInput, EditFileInput } from './tools/file.js'

export { globSearch, grepSearch } from './tools/search.js'
export type { GlobInput, GrepInput } from './tools/search.js'

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
