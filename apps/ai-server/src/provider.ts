/**
 * AI Provider — Unified streaming interface for multiple LLM providers.
 *
 * Supports streaming responses from Gemini, DeepSeek, Qwen, and
 * any OpenAI-compatible API.
 */

import { GoogleGenAI } from '@google/genai';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type AIProvider = 'gemini' | 'deepseek' | 'qwen' | 'openai-compatible';

export interface ProviderPreset {
  label: string;
  model: string;
  baseUrl?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                     */
/* ------------------------------------------------------------------ */

export const PROVIDER_PRESETS: Record<AIProvider, ProviderPreset> = {
  gemini: { label: 'Gemini', model: 'gemini-2.0-flash' },
  deepseek: { label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1/chat/completions' },
  qwen: { label: 'Qwen', model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' },
  'openai-compatible': { label: 'OpenAI 兼容', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1/chat/completions' },
};

const API_KEY_MAP: Record<AIProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'QWEN_API_KEY',
  'openai-compatible': 'OPENAI_API_KEY',
};

export function getProvider(): AIProvider {
  const p = process.env.AI_PROVIDER;
  if (p === 'gemini' || p === 'deepseek' || p === 'qwen' || p === 'openai-compatible') return p;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.QWEN_API_KEY) return 'qwen';
  if (process.env.OPENAI_API_KEY) return 'openai-compatible';
  return 'gemini';
}

export function getApiKey(provider: AIProvider): string {
  return process.env[API_KEY_MAP[provider]] ?? '';
}

export function getModel(provider: AIProvider): string {
  return process.env.AI_MODEL || PROVIDER_PRESETS[provider].model;
}

export function getBaseUrl(provider: AIProvider): string {
  return process.env.AI_BASE_URL || PROVIDER_PRESETS[provider].baseUrl || '';
}

/* ------------------------------------------------------------------ */
/*  Gemini client singleton                                           */
/* ------------------------------------------------------------------ */

let _geminiClient: GoogleGenAI | null = null;
let _geminiKey = '';

function getGeminiClient(apiKey: string): GoogleGenAI {
  if (_geminiClient && _geminiKey === apiKey) return _geminiClient;
  _geminiKey = apiKey;
  _geminiClient = new GoogleGenAI({ apiKey });
  return _geminiClient;
}

/* ------------------------------------------------------------------ */
/*  Streaming                                                         */
/* ------------------------------------------------------------------ */

export type StreamCallback = (chunk: string) => void;

/**
 * Stream AI response token-by-token, calling `onChunk` for each piece.
 * Returns the full assembled text when complete.
 */
export async function streamChatResponse(
  messages: ChatMessage[],
  onChunk: StreamCallback,
): Promise<string> {
  const provider = getProvider();
  const apiKey = getApiKey(provider);
  const model = getModel(provider);

  if (!apiKey) {
    throw new Error(`未配置 ${PROVIDER_PRESETS[provider].label} API Key (${API_KEY_MAP[provider]})`);
  }

  if (provider === 'gemini') {
    return streamGemini(apiKey, model, messages, onChunk);
  } else {
    return streamOpenAICompatible(provider, apiKey, model, messages, onChunk);
  }
}

/* ------------------------------------------------------------------ */
/*  Gemini streaming                                                  */
/* ------------------------------------------------------------------ */

async function streamGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: StreamCallback,
): Promise<string> {
  const client = getGeminiClient(apiKey);

  // Separate system messages from conversation
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  const systemInstruction = systemMessages.map(m => m.content).join('\n');

  const contents = conversationMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: m.content }],
  }));

  const response = await client.models.generateContentStream({
    model,
    contents,
    config: systemInstruction ? { systemInstruction } : undefined,
  });

  let fullText = '';
  for await (const chunk of response) {
    const text = chunk.text ?? '';
    if (text) {
      fullText += text;
      onChunk(text);
    }
  }

  return fullText;
}

/* ------------------------------------------------------------------ */
/*  OpenAI-compatible streaming                                       */
/* ------------------------------------------------------------------ */

async function streamOpenAICompatible(
  provider: AIProvider,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onChunk: StreamCallback,
): Promise<string> {
  const baseUrl = getBaseUrl(provider);
  if (!baseUrl) {
    throw new Error('未配置 API 接口地址');
  }

  const apiMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      stream: true,
      messages: apiMessages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let errMsg: string;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson?.error?.message || errJson?.message || `API 请求失败 (${response.status})`;
    } catch {
      errMsg = `API 请求失败 (${response.status})`;
    }
    throw new Error(errMsg);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          fullText += delta;
          onChunk(delta);
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  return fullText;
}
