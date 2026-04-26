/**
 * OpenAI-Compatible Fetch Adapter
 *
 * Intercepts fetch calls from the Anthropic SDK and routes them to any
 * OpenAI-compatible endpoint (e.g. Qwen/DashScope, DeepSeek, Ollama, vLLM).
 *
 * Translates between Anthropic Messages API format and OpenAI Chat Completions
 * API format (/v1/chat/completions), including full tool-call support and
 * streaming SSE translation.
 *
 * Environment variables:
 *   CLAUDE_CODE_USE_OPENAI=1          — enable this adapter
 *   OPENAI_BASE_URL                   — base URL (default: https://api.openai.com/v1)
 *   OPENAI_API_KEY                    — API key (falls back to ANTHROPIC_API_KEY)
 *   ANTHROPIC_MODEL                   — model name (e.g. qwen-turbo, deepseek-chat)
 */

// ── Types ───────────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | AnthropicContentBlock[]
  source?: { type: string; media_type?: string; data?: string }
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

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

// ── Tool translation: Anthropic → OpenAI ─────────────────────────────

function translateTools(anthropicTools: AnthropicTool[]): OpenAITool[] {
  return anthropicTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} },
    },
  }))
}

// ── Message translation: Anthropic → OpenAI ──────────────────────────

function translateMessages(
  anthropicMessages: AnthropicMessage[],
  systemPrompt?: string,
): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }

  for (const msg of anthropicMessages) {
    if (typeof msg.content === 'string') {
      result.push({
        role: msg.role === 'human' ? 'user' : (msg.role as 'user' | 'assistant'),
        content: msg.content,
      })
      continue
    }

    if (!Array.isArray(msg.content)) continue

    if (msg.role === 'user') {
      // Collect text/image parts; tool_result blocks become 'tool' messages
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []

      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          // Flush any pending user content first
          if (contentParts.length > 0) {
            result.push({
              role: 'user',
              content:
                contentParts.length === 1 && contentParts[0].type === 'text'
                  ? (contentParts[0].text ?? '')
                  : [...contentParts],
            })
            contentParts.length = 0
          }

          const toolCallId = (block.tool_use_id as string) || `call_unknown`
          let outputText = ''
          if (typeof block.content === 'string') {
            outputText = block.content
          } else if (Array.isArray(block.content)) {
            outputText = block.content
              .map((c: AnthropicContentBlock) => (c.type === 'text' ? c.text ?? '' : ''))
              .join('\n')
          }
          result.push({
            role: 'tool',
            content: outputText,
            tool_call_id: toolCallId,
          })
        } else if (block.type === 'text' && typeof block.text === 'string') {
          contentParts.push({ type: 'text', text: block.text })
        } else if (
          block.type === 'image' &&
          block.source?.type === 'base64' &&
          block.source.media_type &&
          block.source.data
        ) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          })
        }
      }

      if (contentParts.length > 0) {
        result.push({
          role: 'user',
          content:
            contentParts.length === 1 && contentParts[0].type === 'text'
              ? (contentParts[0].text ?? '')
              : [...contentParts],
        })
      }
    } else {
      // assistant message — may have text + tool_use blocks
      const toolCalls: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }> = []
      let assistantText = ''

      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          assistantText += block.text
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: (block.id as string) || `call_${toolCalls.length}`,
            type: 'function',
            function: {
              name: (block.name as string) || '',
              arguments: JSON.stringify(block.input || {}),
            },
          })
        }
      }

      const assistantMsg: OpenAIMessage = {
        role: 'assistant',
        content: assistantText,
      }
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls
      }
      result.push(assistantMsg)
    }
  }

  return result
}

// ── Response translation: OpenAI SSE → Anthropic SSE ─────────────────

function formatSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`
}

async function translateOpenAIStreamToAnthropic(
  openAIResponse: Response,
  model: string,
): Promise<Response> {
  const messageId = `msg_openai_${Date.now()}`
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const readable = new ReadableStream({
    async start(controller) {
      // Emit message_start
      controller.enqueue(
        encoder.encode(
          formatSSE(
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

      let contentBlockIndex = 0
      let inTextBlock = false
      let inToolCall = false
      let currentToolCallIndex = -1
      let inputTokens = 0
      let outputTokens = 0
      let hadToolCalls = false

      // Map from tool_call index → content block index (for multi-tool calls)
      const toolCallBlockMap = new Map<number, number>()

      try {
        const reader = openAIResponse.body?.getReader()
        if (!reader) throw new Error('No response body')

        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(data)
            } catch {
              continue
            }

            const choices = event.choices as Array<Record<string, unknown>> | undefined
            if (!choices?.length) {
              // Check for usage in the final chunk
              const usage = event.usage as Record<string, number> | undefined
              if (usage) {
                inputTokens = usage.prompt_tokens ?? inputTokens
                outputTokens = usage.completion_tokens ?? outputTokens
              }
              continue
            }

            for (const choice of choices) {
              const delta = choice.delta as Record<string, unknown> | undefined
              if (!delta) continue

              // Text delta
              if (typeof delta.content === 'string' && delta.content) {
                if (!inTextBlock) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE(
                        'content_block_start',
                        JSON.stringify({
                          type: 'content_block_start',
                          index: contentBlockIndex,
                          content_block: { type: 'text', text: '' },
                        }),
                      ),
                    ),
                  )
                  inTextBlock = true
                }
                controller.enqueue(
                  encoder.encode(
                    formatSSE(
                      'content_block_delta',
                      JSON.stringify({
                        type: 'content_block_delta',
                        index: contentBlockIndex,
                        delta: { type: 'text_delta', text: delta.content },
                      }),
                    ),
                  ),
                )
              }

              // Tool call delta
              const toolCallDelta = delta.tool_calls as
                | Array<Record<string, unknown>>
                | undefined
              if (toolCallDelta) {
                hadToolCalls = true
                for (const tc of toolCallDelta) {
                  const tcIndex = tc.index as number
                  const tcFunc = tc.function as Record<string, string> | undefined

                  // Close open text block if we're starting tool calls
                  if (inTextBlock) {
                    controller.enqueue(
                      encoder.encode(
                        formatSSE(
                          'content_block_stop',
                          JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
                        ),
                      ),
                    )
                    contentBlockIndex++
                    inTextBlock = false
                  }

                  if (!toolCallBlockMap.has(tcIndex)) {
                    // New tool call — start a new tool_use block
                    const blockIdx = contentBlockIndex
                    toolCallBlockMap.set(tcIndex, blockIdx)
                    contentBlockIndex++
                    inToolCall = true
                    currentToolCallIndex = tcIndex

                    const toolId = (tc.id as string) || `call_${tcIndex}`
                    const toolName = tcFunc?.name || ''

                    controller.enqueue(
                      encoder.encode(
                        formatSSE(
                          'content_block_start',
                          JSON.stringify({
                            type: 'content_block_start',
                            index: blockIdx,
                            content_block: {
                              type: 'tool_use',
                              id: toolId,
                              name: toolName,
                              input: {},
                            },
                          }),
                        ),
                      ),
                    )
                  }

                  // Stream tool call argument fragments
                  if (tcFunc?.arguments) {
                    const blockIdx = toolCallBlockMap.get(tcIndex) ?? contentBlockIndex - 1
                    controller.enqueue(
                      encoder.encode(
                        formatSSE(
                          'content_block_delta',
                          JSON.stringify({
                            type: 'content_block_delta',
                            index: blockIdx,
                            delta: { type: 'input_json_delta', partial_json: tcFunc.arguments },
                          }),
                        ),
                      ),
                    )
                  }
                }
              }

              // Finish reason
              const finishReason = choice.finish_reason as string | null
              if (finishReason) {
                // Close all open blocks
                if (inTextBlock) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE(
                        'content_block_stop',
                        JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex - 1 }),
                      ),
                    ),
                  )
                  inTextBlock = false
                }
                for (const [, blockIdx] of toolCallBlockMap) {
                  controller.enqueue(
                    encoder.encode(
                      formatSSE(
                        'content_block_stop',
                        JSON.stringify({ type: 'content_block_stop', index: blockIdx }),
                      ),
                    ),
                  )
                }
                toolCallBlockMap.clear()
                inToolCall = false
              }

              // Usage in the final delta
              const usage = event.usage as Record<string, number> | undefined
              if (usage) {
                inputTokens = usage.prompt_tokens ?? inputTokens
                outputTokens = usage.completion_tokens ?? outputTokens
              }
            }
          }
        }
      } catch (err) {
        // Ensure we don't leave blocks open on error
        if (inTextBlock) {
          controller.enqueue(
            encoder.encode(
              formatSSE(
                'content_block_delta',
                JSON.stringify({
                  type: 'content_block_delta',
                  index: contentBlockIndex,
                  delta: { type: 'text_delta', text: `\n[Error: ${String(err)}]` },
                }),
              ),
            ),
          )
          controller.enqueue(
            encoder.encode(
              formatSSE(
                'content_block_stop',
                JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
              ),
            ),
          )
        }
      }

      // Emit message_delta with stop_reason
      const stopReason = hadToolCalls ? 'tool_use' : 'end_turn'
      controller.enqueue(
        encoder.encode(
          formatSSE(
            'message_delta',
            JSON.stringify({
              type: 'message_delta',
              delta: { stop_reason: stopReason, stop_sequence: null },
              usage: { output_tokens: outputTokens },
            }),
          ),
        ),
      )
      controller.enqueue(
        encoder.encode(
          formatSSE(
            'message_stop',
            JSON.stringify({
              type: 'message_stop',
              usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            }),
          ),
        ),
      )
      controller.close()
    },
  })

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'x-request-id': messageId,
    },
  })
}

// ── Main fetch interceptor ────────────────────────────────────────────

/**
 * Creates a fetch function that intercepts Anthropic API calls and routes them
 * to any OpenAI-compatible endpoint (e.g. Qwen DashScope, DeepSeek, Ollama).
 *
 * @param apiKey  - API key for the OpenAI-compatible provider
 * @param baseUrl - Base URL for the provider (e.g. https://dashscope.aliyuncs.com/compatible-mode/v1)
 */
export function createOpenAICompatFetch(
  apiKey: string,
  baseUrl: string,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const normalizedBase = baseUrl.replace(/\/$/, '')

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)

    // Only intercept Anthropic Messages API calls
    if (!url.includes('/v1/messages')) {
      return globalThis.fetch(input, init)
    }

    // Parse the Anthropic request body
    let anthropicBody: Record<string, unknown> = {}
    try {
      const bodyText =
        init?.body instanceof ReadableStream
          ? await new Response(init.body).text()
          : typeof init?.body === 'string'
            ? init.body
            : JSON.stringify(init?.body ?? {})
      anthropicBody = JSON.parse(bodyText)
    } catch {
      anthropicBody = {}
    }

    const model = (anthropicBody.model as string) || 'gpt-3.5-turbo'
    const anthropicMessages = (anthropicBody.messages || []) as AnthropicMessage[]
    const anthropicTools = (anthropicBody.tools || []) as AnthropicTool[]

    // Build system prompt string
    const rawSystem = anthropicBody.system as
      | string
      | Array<{ type: string; text?: string }>
      | undefined
    let systemPrompt: string | undefined
    if (typeof rawSystem === 'string') {
      systemPrompt = rawSystem
    } else if (Array.isArray(rawSystem)) {
      systemPrompt = rawSystem
        .filter(b => b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text!)
        .join('\n')
    }

    const openAIMessages = translateMessages(anthropicMessages, systemPrompt)

    const requestBody: Record<string, unknown> = {
      model,
      messages: openAIMessages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: (anthropicBody.max_tokens as number) || 4096,
      temperature: (anthropicBody.temperature as number) ?? 1,
    }

    if (anthropicTools.length > 0) {
      requestBody.tools = translateTools(anthropicTools)
      requestBody.tool_choice = 'auto'
      requestBody.parallel_tool_calls = true
    }

    const openAIResponse = await globalThis.fetch(`${normalizedBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text()
      const errorBody = {
        type: 'error',
        error: {
          type: 'api_error',
          message: `OpenAI-compat API error (${openAIResponse.status}): ${errorText}`,
        },
      }
      return new Response(JSON.stringify(errorBody), {
        status: openAIResponse.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return translateOpenAIStreamToAnthropic(openAIResponse, model)
  }
}
