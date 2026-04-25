import { QueryEngine } from '../QueryEngine.js'
import { hasPermissionsToUseTool } from '../utils/permissions/permissions.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import { getCwd } from '../utils/cwd.js'
import {
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from '../utils/fileStateCache.js'
import { createHeadlessStore } from './headlessState.js'
import { HEADLESS_TOOLS } from './headlessTools.js'

export interface HeadlessQueryOptions {
  systemPrompt?: string
  appendSystemPrompt?: string
  maxTurns?: number
  verbose?: boolean
  bypassPermissions?: boolean
  cwd?: string
  model?: string
  tools?: typeof HEADLESS_TOOLS
  initialMessages?: unknown[]
}

export async function* headlessQuery(
  prompt: string,
  options: HeadlessQueryOptions = {},
): AsyncGenerator<SDKMessage> {
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
    initialMessages: (options.initialMessages ?? []) as any,
  })

  yield* engine.submitMessage(prompt)
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
