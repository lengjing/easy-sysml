/**
 * OpenAI-Compatible Fetch Adapter
 *
 * Intercepts fetch calls from the Anthropic SDK and routes them to any
 * OpenAI Chat Completions compatible endpoint (DeepSeek, Qwen, etc.),
 * translating between Anthropic Messages API format and OpenAI Chat
 * Completions API format.
 *
 * Supports:
 * - Text messages (user/assistant/system)
 * - Tool definitions (Anthropic input_schema → OpenAI function parameters)
 * - Tool use (tool_use → function_call, tool_result → tool message)
 * - Streaming events translation (SSE delta → Anthropic content_block_delta)
 *
 * Enable via environment variables:
 *   CLAUDE_CODE_USE_OPENAI_COMPAT=1
 *   OPENAI_COMPAT_BASE_URL=https://api.deepseek.com/v1   (required)
 *   OPENAI_COMPAT_API_KEY=sk-...                         (required)
 *   OPENAI_COMPAT_MODEL=deepseek-chat                    (optional)
 */

// ── Types ────────────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | AnthropicContentBlock[]
  source?: {
    type: string
    media_type?: string
    data?: string
  }
  [key: string]: unknown
}

interface AnthropicMessage {
  role: string
  content: string | AnthropicContentBlock[]
}

interface AnthropicTool {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
}

// ── Well-known provider presets ──────────────────────────────────────

export const OPENAI_COMPAT_PROVIDERS: Record<
  string,
  { baseUrl: string; defaultModel: string; label: string }
> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    label: 'DeepSeek',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    label: 'Qwen (Alibaba Cloud)',
  },
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function getOpenAICompatProviderPreset():
  | { key: string; baseUrl: string; defaultModel: string; label: string }
  | null {
  const providerKey = process.env.OPENAI_COMPAT_PROVIDER?.trim().toLowerCase()
  if (providerKey) {
    const preset = OPENAI_COMPAT_PROVIDERS[providerKey]
    if (preset) {
      return { key: providerKey, ...preset }
    }
  }

  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL
  if (!baseUrl) {
    return null
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  for (const [key, preset] of Object.entries(OPENAI_COMPAT_PROVIDERS)) {
    if (normalizeBaseUrl(preset.baseUrl) === normalizedBaseUrl) {
      return { key, ...preset }
    }
  }

  return null
}

/**
 * Model name mapping: Claude model name → OpenAI-compatible model name.
 * Falls back to OPENAI_COMPAT_MODEL env var or 'gpt-4o' if not found.
 */
function mapModelName(claudeModel: string | null): string {
  const envModel = process.env.OPENAI_COMPAT_MODEL?.trim()
  if (envModel) return envModel

  const preset = getOpenAICompatProviderPreset()
  const fallbackModel = preset?.defaultModel ?? 'deepseek-chat'

  if (!claudeModel) return fallbackModel
  const lower = claudeModel.toLowerCase()

  // If already looks like an OpenAI-compat model, pass through
  if (!lower.startsWith('claude')) return claudeModel

  // Map Claude tiers to reasonable defaults
  if (lower.includes('opus')) return fallbackModel
  if (lower.includes('sonnet')) return fallbackModel
  if (lower.includes('haiku')) return fallbackModel
  return fallbackModel
}

// ── Counter for deterministic tool call IDs ──────────────────────────

let _toolCallCounter = 0
function nextToolCallId(): string {
  return `toolu_compat_${++_toolCallCounter}`
}

// ── Tool translation ─────────────────────────────────────────────────

function translateTools(
  tools: AnthropicTool[],
): Array<Record<string, unknown>> {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.input_schema ?? { type: 'object', properties: {} },
    },
  }))
}

// ── Message translation: Anthropic → OpenAI ─────────────────────────

function translateMessages(
  anthropicMessages: AnthropicMessage[],
  systemPrompt?: string,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []

  if (systemPrompt) {
    out.push({ role: 'system', content: systemPrompt })
  }

  for (const msg of anthropicMessages) {
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role, content: msg.content })
      continue
    }

    if (!Array.isArray(msg.content)) continue

    if (msg.role === 'assistant') {
      // Collect text and tool_use blocks
      const textParts: string[] = []
      const toolCalls: Array<Record<string, unknown>> = []

      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          textParts.push(block.text)
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id ?? nextToolCallId(),
            type: 'function',
            function: {
              name: block.name ?? '',
              arguments: typeof block.input === 'object'
                ? JSON.stringify(block.input)
                : String(block.input ?? ''),
            },
          })
        }
      }

      const assistantMsg: Record<string, unknown> = { role: 'assistant' }
      assistantMsg.content = textParts.join('\n') || null
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls
      }
      out.push(assistantMsg)
    } else if (msg.role === 'user') {
      // User messages may contain text and tool_result blocks
      const textBlocks: string[] = []
      const toolResultMsgs: Array<Record<string, unknown>> = []

      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          let resultText = ''
          if (typeof block.content === 'string') {
            resultText = block.content
          } else if (Array.isArray(block.content)) {
            resultText = block.content
              .map((c: AnthropicContentBlock) =>
                c.type === 'text' ? c.text ?? '' : '',
              )
              .join('\n')
          }
          toolResultMsgs.push({
            role: 'tool',
            tool_call_id: block.tool_use_id ?? '',
            content: resultText,
          })
        } else if (block.type === 'text' && typeof block.text === 'string') {
          textBlocks.push(block.text)
        } else if (block.type === 'image') {
          // Images: skip or embed as data URL if supported
          const src = block.source
          if (
            src &&
            typeof src === 'object' &&
            src.type === 'base64' &&
            src.data &&
            src.media_type
          ) {
            textBlocks.push(`[Image: data:${src.media_type};base64,${src.data}]`)
          }
        }
      }

      if (textBlocks.length > 0) {
        out.push({ role: 'user', content: textBlocks.join('\n') })
      }
      for (const tr of toolResultMsgs) {
        out.push(tr)
      }
    }
  }

  return out
}

// ── SSE helpers ──────────────────────────────────────────────────────

function encodeSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`
}

function translateNonStreamingToAnthropic(
  openAIResponseBody: Record<string, unknown>,
  model: string,
): Response {
  const choices =
    (openAIResponseBody.choices as Array<Record<string, unknown>> | undefined) ?? []
  const firstChoice = choices[0] ?? {}
  const message = (firstChoice.message as Record<string, unknown> | undefined) ?? {}
  const toolCalls =
    (message.tool_calls as Array<Record<string, unknown>> | undefined) ?? []
  const usage = (openAIResponseBody.usage as Record<string, unknown> | undefined) ?? {}

  const content: AnthropicContentBlock[] = []

  if (typeof message.content === 'string' && message.content.length > 0) {
    content.push({ type: 'text', text: message.content })
  }

  for (const toolCall of toolCalls) {
    const fn = (toolCall.function as Record<string, unknown> | undefined) ?? {}
    let parsedInput: Record<string, unknown> = {}
    if (typeof fn.arguments === 'string' && fn.arguments.length > 0) {
      try {
        parsedInput = JSON.parse(fn.arguments) as Record<string, unknown>
      } catch {
        parsedInput = { raw: fn.arguments }
      }
    }

    content.push({
      type: 'tool_use',
      id: String(toolCall.id ?? nextToolCallId()),
      name: String(fn.name ?? ''),
      input: parsedInput,
    })
  }

  const anthropicBody = {
    id: `msg_compat_${nextToolCallId()}`,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason:
      typeof firstChoice.finish_reason === 'string'
        ? firstChoice.finish_reason === 'tool_calls'
          ? 'tool_use'
          : 'end_turn'
        : null,
    stop_sequence: null,
    usage: {
      input_tokens:
        typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0,
      output_tokens:
        typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0,
    },
  }

  return new Response(JSON.stringify(anthropicBody), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// ── Stream translation: OpenAI SSE → Anthropic SSE ──────────────────

/**
 * Translates an OpenAI Chat Completions streaming response into
 * an Anthropic Messages API streaming response.
 */
async function translateStreamToAnthropic(
  openAIResponse: Response,
  model: string,
): Promise<Response> {
  const messageId = `msg_compat_${nextToolCallId()}`

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()

      // Emit message_start
      controller.enqueue(
        enc.encode(
          encodeSSE(
            'message_start',
            JSON.stringify({
              type: 'message_start',
              message: {
                id: messageId,
                type: 'message',
                role: 'assistant',
                content: [],
                model,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
            }),
          ),
        ),
      )

      controller.enqueue(
        enc.encode(encodeSSE('ping', JSON.stringify({ type: 'ping' }))),
      )

      let contentBlockIdx = 0
      let textBlockOpen = false
      // Track tool call blocks: toolCallIndex → { id, name, args, blockIdx }
      const toolCallBlocks = new Map<
        number,
        { id: string; name: string; blockIdx: number }
      >()

      const reader = openAIResponse.body?.getReader()
      if (!reader) {
        controller.enqueue(
          enc.encode(
            encodeSSE(
              'content_block_start',
              JSON.stringify({
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              }),
            ),
          ),
        )
        controller.enqueue(
          enc.encode(
            encodeSSE(
              'content_block_delta',
              JSON.stringify({
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Error: No response body' },
              }),
            ),
          ),
        )
        finishStream(controller, enc, contentBlockIdx, false)
        return
      }

      const decoder = new TextDecoder()
      let buf = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue
            const dataStr = trimmed.slice(6)
            if (dataStr === '[DONE]') continue

            let chunk: Record<string, unknown>
            try {
              chunk = JSON.parse(dataStr)
            } catch {
              continue
            }

            const choices = (chunk.choices as Array<Record<string, unknown>>) ?? []
            for (const choice of choices) {
              const delta = (choice.delta ?? {}) as Record<string, unknown>

              // ── Text content ───────────────────────────────────
              if (typeof delta.content === 'string' && delta.content.length > 0) {
                if (!textBlockOpen) {
                  controller.enqueue(
                    enc.encode(
                      encodeSSE(
                        'content_block_start',
                        JSON.stringify({
                          type: 'content_block_start',
                          index: contentBlockIdx,
                          content_block: { type: 'text', text: '' },
                        }),
                      ),
                    ),
                  )
                  textBlockOpen = true
                }
                controller.enqueue(
                  enc.encode(
                    encodeSSE(
                      'content_block_delta',
                      JSON.stringify({
                        type: 'content_block_delta',
                        index: contentBlockIdx,
                        delta: { type: 'text_delta', text: delta.content },
                      }),
                    ),
                  ),
                )
              }

              // ── Reasoning content (DeepSeek r1 etc.) ───────────
              if (
                typeof (delta as Record<string, unknown>).reasoning_content === 'string' &&
                ((delta as Record<string, unknown>).reasoning_content as string).length > 0
              ) {
                const thinkingText = (delta as Record<string, unknown>).reasoning_content as string
                // Emit as a thinking block if no text block open
                if (!textBlockOpen) {
                  controller.enqueue(
                    enc.encode(
                      encodeSSE(
                        'content_block_start',
                        JSON.stringify({
                          type: 'content_block_start',
                          index: contentBlockIdx,
                          content_block: { type: 'thinking', thinking: '' },
                        }),
                      ),
                    ),
                  )
                  textBlockOpen = true
                }
                controller.enqueue(
                  enc.encode(
                    encodeSSE(
                      'content_block_delta',
                      JSON.stringify({
                        type: 'content_block_delta',
                        index: contentBlockIdx,
                        delta: { type: 'thinking_delta', thinking: thinkingText },
                      }),
                    ),
                  ),
                )
              }

              // ── Tool calls ─────────────────────────────────────
              const toolCallDeltas = (delta.tool_calls as Array<Record<string, unknown>>) ?? []
              for (const tcDelta of toolCallDeltas) {
                const tcIdx = tcDelta.index as number
                const func = (tcDelta.function ?? {}) as Record<string, unknown>

                if (tcDelta.id !== undefined) {
                  // New tool call starting
                  if (textBlockOpen) {
                    controller.enqueue(
                      enc.encode(
                        encodeSSE(
                          'content_block_stop',
                          JSON.stringify({
                            type: 'content_block_stop',
                            index: contentBlockIdx,
                          }),
                        ),
                      ),
                    )
                    contentBlockIdx++
                    textBlockOpen = false
                  }

                  const toolBlockIdx = contentBlockIdx
                  toolCallBlocks.set(tcIdx, {
                    id: tcDelta.id as string,
                    name: (func.name as string) ?? '',
                    blockIdx: toolBlockIdx,
                  })
                  contentBlockIdx++

                  controller.enqueue(
                    enc.encode(
                      encodeSSE(
                        'content_block_start',
                        JSON.stringify({
                          type: 'content_block_start',
                          index: toolBlockIdx,
                          content_block: {
                            type: 'tool_use',
                            id: tcDelta.id,
                            name: (func.name as string) ?? '',
                            input: {},
                          },
                        }),
                      ),
                    ),
                  )
                }

                // Argument streaming delta
                if (typeof func.arguments === 'string' && func.arguments.length > 0) {
                  const tc = toolCallBlocks.get(tcIdx)
                  if (tc) {
                    controller.enqueue(
                      enc.encode(
                        encodeSSE(
                          'content_block_delta',
                          JSON.stringify({
                            type: 'content_block_delta',
                            index: tc.blockIdx,
                            delta: { type: 'input_json_delta', partial_json: func.arguments },
                          }),
                        ),
                      ),
                    )
                  }
                }
              }

              // ── Finish reason ──────────────────────────────────
              if (choice.finish_reason) {
                if (textBlockOpen) {
                  controller.enqueue(
                    enc.encode(
                      encodeSSE(
                        'content_block_stop',
                        JSON.stringify({
                          type: 'content_block_stop',
                          index: contentBlockIdx,
                        }),
                      ),
                    ),
                  )
                  textBlockOpen = false
                }
                // Close all open tool call blocks
                for (const tc of toolCallBlocks.values()) {
                  controller.enqueue(
                    enc.encode(
                      encodeSSE(
                        'content_block_stop',
                        JSON.stringify({
                          type: 'content_block_stop',
                          index: tc.blockIdx,
                        }),
                      ),
                    ),
                  )
                }
                toolCallBlocks.clear()

                finishStream(
                  controller,
                  enc,
                  contentBlockIdx,
                  choice.finish_reason === 'tool_calls',
                )
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Ensure stream is finished even if we didn't see finish_reason
      if (textBlockOpen) {
        controller.enqueue(
          enc.encode(
            encodeSSE(
              'content_block_stop',
              JSON.stringify({ type: 'content_block_stop', index: contentBlockIdx }),
            ),
          ),
        )
      }
      finishStream(controller, enc, contentBlockIdx, false)
      controller.close()
    },
  })

  return new Response(readable, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function finishStream(
  controller: ReadableStreamDefaultController,
  enc: TextEncoder,
  lastIndex: number,
  hadToolCalls: boolean,
): void {
  const stopReason = hadToolCalls ? 'tool_use' : 'end_turn'
  controller.enqueue(
    enc.encode(
      encodeSSE(
        'message_delta',
        JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: lastIndex },
        }),
      ),
    ),
  )
  controller.enqueue(
    enc.encode(
      encodeSSE(
        'message_stop',
        JSON.stringify({ type: 'message_stop' }),
      ),
    ),
  )
  try {
    controller.close()
  } catch {
    // Already closed
  }
}

// ── Main adapter ─────────────────────────────────────────────────────

/**
 * Create a custom fetch function that routes Anthropic API calls
 * to any OpenAI-compatible endpoint.
 *
 * @param baseUrl  The base URL for the OpenAI-compatible API
 * @param apiKey   The API key for authentication
 */
export function createOpenAICompatFetch(
  baseUrl: string,
  apiKey: string,
): typeof fetch {
  // Normalize base URL
  const normalizedBase = normalizeBaseUrl(baseUrl)

  const adapter = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)

    // Only intercept Anthropic messages endpoint
    if (!url.includes('/messages')) {
      return fetch(input, init)
    }

    // Parse the Anthropic request body
    let body: Record<string, unknown>
    try {
      const rawBody =
        init?.body instanceof Uint8Array
          ? new TextDecoder().decode(init.body)
          : typeof init?.body === 'string'
            ? init.body
            : JSON.stringify(init?.body)
      body = JSON.parse(rawBody)
    } catch {
      return fetch(input, init)
    }

    const claudeModel = body.model as string
    const model = mapModelName(claudeModel)
    const anthropicMessages = (body.messages || []) as AnthropicMessage[]
    const anthropicTools = (body.tools || []) as AnthropicTool[]
    const wantsStreaming = body.stream === true

    // Extract system prompt
    let systemPrompt: string | undefined
    if (typeof body.system === 'string') {
      systemPrompt = body.system
    } else if (Array.isArray(body.system)) {
      systemPrompt = (body.system as Array<{ type: string; text?: string }>)
        .filter(b => b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text!)
        .join('\n')
    }

    const openAIMessages = translateMessages(anthropicMessages, systemPrompt)
    const openAIBody: Record<string, unknown> = {
      model,
      messages: openAIMessages,
      stream: wantsStreaming,
      temperature: body.temperature ?? 0.7,
    }

    if (typeof body.max_tokens === 'number') {
      openAIBody.max_tokens = body.max_tokens
    }

    if (anthropicTools.length > 0) {
      openAIBody.tools = translateTools(anthropicTools)
      openAIBody.tool_choice = 'auto'
    }

    const resp = await fetch(`${normalizedBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        accept: wantsStreaming ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(openAIBody),
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      return new Response(
        JSON.stringify({
          error: {
            type: 'api_error',
            message: `OpenAI-compat API error ${resp.status}: ${errText}`,
          },
        }),
        {
          status: resp.status,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    if (wantsStreaming) {
      return translateStreamToAnthropic(resp, model)
    }

    let parsedBody: Record<string, unknown>
    try {
      parsedBody = (await resp.json()) as Record<string, unknown>
    } catch {
      return new Response(
        JSON.stringify({
          error: {
            type: 'api_error',
            message: 'OpenAI-compat API returned invalid JSON for non-streaming request.',
          },
        }),
        {
          status: 502,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    return translateNonStreamingToAnthropic(parsedBody, model)
  }

  return Object.assign(adapter, {
    preconnect: globalThis.fetch.preconnect?.bind(globalThis.fetch),
  }) as typeof fetch
}

/**
 * Returns a configured OpenAI-compat fetch adapter if
 * CLAUDE_CODE_USE_OPENAI_COMPAT=1 is set, or null otherwise.
 */
export function getOpenAICompatFetch(): typeof fetch | null {
  const enabled =
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT === '1' ||
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT === 'true'

  if (!enabled) return null

  const preset = getOpenAICompatProviderPreset()
  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL ?? preset?.baseUrl
  const apiKey = process.env.OPENAI_COMPAT_API_KEY

  if (!baseUrl || !apiKey) {
    console.warn(
      '[OpenAI-Compat] CLAUDE_CODE_USE_OPENAI_COMPAT=1 is set but ' +
        'OPENAI_COMPAT_BASE_URL (or OPENAI_COMPAT_PROVIDER) or OPENAI_COMPAT_API_KEY is missing.',
    )
    return null
  }

  return createOpenAICompatFetch(baseUrl, apiKey)
}
