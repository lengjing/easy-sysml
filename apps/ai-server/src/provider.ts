/**
 * AI Provider — Multi-provider model registry using Vercel AI SDK.
 *
 * Supports Gemini, DeepSeek, Qwen, and any OpenAI-compatible API.
 * Each provider is configured via environment variables.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type AIProvider = 'gemini' | 'deepseek' | 'qwen' | 'openai-compatible';

export interface ProviderPreset {
  label: string;
  defaultModel: string;
  baseURL?: string;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                     */
/* ------------------------------------------------------------------ */

export const PROVIDER_PRESETS: Record<AIProvider, ProviderPreset> = {
  gemini: {
    label: 'Gemini',
    defaultModel: 'gemini-2.0-flash',
  },
  deepseek: {
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    baseURL: 'https://api.deepseek.com/v1',
  },
  qwen: {
    label: 'Qwen',
    defaultModel: 'qwen-plus',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  'openai-compatible': {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    baseURL: 'https://api.openai.com/v1',
  },
};

const API_KEY_MAP: Record<AIProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'QWEN_API_KEY',
  'openai-compatible': 'OPENAI_API_KEY',
};

/* ------------------------------------------------------------------ */
/*  Environment helpers                                               */
/* ------------------------------------------------------------------ */

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

export function getModelId(provider: AIProvider): string {
  return process.env.AI_MODEL || PROVIDER_PRESETS[provider].defaultModel;
}

/* ------------------------------------------------------------------ */
/*  Model creation using Vercel AI SDK                                */
/* ------------------------------------------------------------------ */

/**
 * Create a Vercel AI SDK LanguageModel instance for the given provider.
 * This model supports streaming, tool calling, and multi-step agent loops.
 */
export function createModel(provider: AIProvider): LanguageModel {
  const apiKey = getApiKey(provider);
  const modelId = getModelId(provider);
  const preset = PROVIDER_PRESETS[provider];

  if (!apiKey) {
    throw new Error(`未配置 ${preset.label} API Key (${API_KEY_MAP[provider]})`);
  }

  if (provider === 'gemini') {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelId);
  }

  // DeepSeek, Qwen, OpenAI — all use OpenAI Chat Completions API.
  // Must use `.chat()` explicitly: the default `openai()` in @ai-sdk/openai v3
  // dispatches to the Responses API (/responses), which only OpenAI supports.
  // DeepSeek, Qwen, and other OpenAI-compatible providers only support
  // the Chat Completions endpoint (/chat/completions).
  const baseURL = process.env.AI_BASE_URL || preset.baseURL;
  const openai = createOpenAI({ apiKey, baseURL });
  return openai.chat(modelId);
}
