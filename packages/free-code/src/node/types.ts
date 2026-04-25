/**
 * Re-exports the SDK message types from free-code's agentSdkTypes entrypoint.
 *
 * These are the same types used by the official Claude Code SDK and emitted by
 * the free-code CLI when run with `--output-format stream-json`.
 *
 * @see src/entrypoints/agentSdkTypes.ts  — canonical source
 * @see src/entrypoints/sdk/coreTypes.generated.ts — generated type definitions
 */

// Re-export all public SDK types from free-code's own agentSdkTypes module.
// These cover the full NDJSON message stream: assistant, user, result, system,
// tool_progress, status, compact_boundary, permission_denial, rate_limit, etc.
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
} from '../entrypoints/agentSdkTypes.js'

// ---------------------------------------------------------------------------
// Client-specific types (not part of the SDK message protocol)
// ---------------------------------------------------------------------------

/** Options for spawning a free-code query */
export type QueryOptions = {
  /**
   * Working directory for the agent. Defaults to `process.cwd()`.
   */
  cwd?: string

  /**
   * Model name or alias to use. Respects the same overrides as the CLI:
   * `ANTHROPIC_MODEL` env var, `--model` flag, etc.
   */
  model?: string

  /**
   * Maximum number of agentic turns. Maps to `--max-turns`.
   * Defaults to unlimited (CLI default).
   */
  maxTurns?: number

  /**
   * Maximum API spend in USD. Maps to `--max-budget-usd`.
   */
  maxBudgetUSD?: number

  /**
   * When true, all tool permissions are automatically granted.
   * Maps to `--dangerously-skip-permissions`.
   * Use only in trusted sandboxes.
   */
  dangerouslySkipPermissions?: boolean

  /**
   * System prompt to prepend. Maps to `--system-prompt`.
   */
  systemPrompt?: string

  /**
   * Additional environment variables to pass to the CLI subprocess.
   */
  env?: Record<string, string>

  /**
   * Abort signal to cancel the query mid-stream.
   */
  signal?: AbortSignal

  /**
   * Session ID to resume. Maps to `--resume`.
   */
  sessionId?: string

  /**
   * Custom path to the free-code binary.
   * If not set, falls back to `FREE_CODE_BIN` env var, then auto-discovery.
   */
  binPath?: string
}

/** Result of a completed (one-shot) query */
export type RunQueryResult = {
  /** Final text response from the model */
  result: string
  /** True if the query ended in an error */
  isError: boolean
  /** All messages emitted during the query */
  messages: import('../entrypoints/agentSdkTypes.js').SDKMessage[]
  /** Total API cost in USD */
  totalCostUSD?: number
  /** Duration of the query in milliseconds */
  durationMs?: number
  /** Number of agentic turns used */
  numTurns?: number
  /** Session ID (for resuming later) */
  sessionId?: string
}
