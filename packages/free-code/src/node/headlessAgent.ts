import { QueryEngine } from '../QueryEngine.js'
import { hasPermissionsToUseTool } from '../utils/permissions/permissions.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { Message } from '../types/message.js'
import { getCwd } from '../utils/cwd.js'
import {
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from '../utils/fileStateCache.js'
import { createHeadlessStore } from './headlessState.js'
import { HEADLESS_TOOLS } from './headlessTools.js'

/**
 * OpenAI-compatible provider configuration.
 * Set these to route requests through any OpenAI chat/completions endpoint
 * (e.g. Qwen DashScope, DeepSeek, Ollama, vLLM).
 */
export interface OpenAICompatConfig {
  /** Base URL of the OpenAI-compatible endpoint.
   *  Examples:
   *   - Qwen: https://dashscope.aliyuncs.com/compatible-mode/v1
   *   - DeepSeek: https://api.deepseek.com/v1
   *   - Ollama: http://localhost:11434/v1
   */
  baseUrl: string
  /** API key for the provider (may also be read from OPENAI_API_KEY). */
  apiKey?: string
}

export interface HeadlessQueryOptions {
  systemPrompt?: string
  appendSystemPrompt?: string
  maxTurns?: number
  verbose?: boolean
  /**
   * When false, tool use requires explicit permission rules.
   * Defaults to true (bypass all permissions) — appropriate for
   * automated/programmatic headless usage in trusted environments.
   */
  bypassPermissions?: boolean
  cwd?: string
  model?: string
  tools?: typeof HEADLESS_TOOLS
  /** Seed conversation history (typed as Message from free-code internals). */
  initialMessages?: Message[]
  /**
   * Use an OpenAI-compatible provider instead of Anthropic.
   * When set, automatically configures CLAUDE_CODE_USE_OPENAI=1,
   * OPENAI_BASE_URL, OPENAI_API_KEY, and ANTHROPIC_MODEL env vars
   * for the duration of the query.
   */
  openAICompat?: OpenAICompatConfig
}

export async function* headlessQuery(
  prompt: string,
  options: HeadlessQueryOptions = {},
): AsyncGenerator<SDKMessage> {
  // Apply OpenAI-compat provider env vars if configured
  const envBackup: Record<string, string | undefined> = {}
  if (options.openAICompat) {
    const { baseUrl, apiKey } = options.openAICompat
    const envVars: Record<string, string> = {
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_BASE_URL: baseUrl,
    }
    if (apiKey) {
      envVars.OPENAI_API_KEY = apiKey
    }
    if (options.model) {
      envVars.ANTHROPIC_MODEL = options.model
    }
    for (const [k, v] of Object.entries(envVars)) {
      envBackup[k] = process.env[k]
      process.env[k] = v
    }
  }

  try {
    const store = createHeadlessStore({
      bypassPermissions: options.bypassPermissions !== false,
      verbose: options.verbose,
    })

    const engine = new QueryEngine({
      cwd: options.cwd ?? getCwd(),
      tools: options.tools ?? HEADLESS_TOOLS,
      commands: [],
      mcpClients: [],
      agents: [],
      canUseTool: hasPermissionsToUseTool,
      getAppState: () => store.getState(),
      setAppState: store.setState.bind(store),
      customSystemPrompt: options.systemPrompt,
      appendSystemPrompt: options.appendSystemPrompt,
      maxTurns: options.maxTurns,
      verbose: options.verbose,
      userSpecifiedModel: options.model,
      readFileCache: createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE),
      initialMessages: options.initialMessages ?? [],
    })

    yield* engine.submitMessage(prompt)
  } finally {
    // Restore env vars if we patched them
    if (options.openAICompat) {
      for (const [k, v] of Object.entries(envBackup)) {
        if (v === undefined) {
          delete process.env[k]
        } else {
          process.env[k] = v
        }
      }
    }
  }
}

export async function headlessRunQuery(
  prompt: string,
  options: HeadlessQueryOptions = {},
): Promise<{ result: SDKMessage | undefined; messages: SDKMessage[] }> {
  const messages: SDKMessage[] = []
  let result: SDKMessage | undefined
  for await (const msg of headlessQuery(prompt, options)) {
    messages.push(msg)
    if (msg.type === 'result') result = msg
  }
  return { result, messages }
}

