import type { ModelName } from './model.js'

export type OpenAICompatProviderModelOption = {
  description: string
  id: ModelName
  label: string
}

export type OpenAICompatProviderPreset = {
  baseUrl: string
  defaultModel: ModelName
  fastModel: ModelName
  key: string
  label: string
  models: OpenAICompatProviderModelOption[]
  reasoningModel: ModelName
}

const OPENAI_COMPAT_PROVIDER_PRESETS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    fastModel: 'deepseek-v4-flash',
    label: 'DeepSeek',
    models: [
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        description: 'DeepSeek V4 Flash · Fast default model for chat and coding',
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        description: 'DeepSeek V4 Pro · Stronger reasoning and coding depth',
      },
      {
        id: 'deepseek-chat',
        label: 'DeepSeek Chat',
        description: 'Legacy model · Deprecated after 2026-07-24',
      },
      {
        id: 'deepseek-reasoner',
        label: 'DeepSeek Reasoner',
        description: 'Legacy reasoning model · Deprecated after 2026-07-24',
      },
    ],
    reasoningModel: 'deepseek-v4-pro',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    fastModel: 'qwen-plus',
    label: 'Qwen (Alibaba Cloud)',
    models: [
      {
        id: 'qwen-plus',
        label: 'Qwen Plus',
        description: 'Qwen Plus · Balanced chat and coding',
      },
      {
        id: 'qwen-max',
        label: 'Qwen Max',
        description: 'Qwen Max · Stronger reasoning and coding depth',
      },
    ],
    reasoningModel: 'qwen-max',
  },
} as const satisfies Record<
  string,
  Omit<OpenAICompatProviderPreset, 'key'>
>

export const OPENAI_COMPAT_PROVIDERS: Record<
  string,
  Omit<OpenAICompatProviderPreset, 'key'>
> = OPENAI_COMPAT_PROVIDER_PRESETS

export function normalizeOpenAICompatBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export function getOpenAICompatProviderPreset(): OpenAICompatProviderPreset | null {
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

  const normalizedBaseUrl = normalizeOpenAICompatBaseUrl(baseUrl)
  for (const [key, preset] of Object.entries(OPENAI_COMPAT_PROVIDERS)) {
    if (normalizeOpenAICompatBaseUrl(preset.baseUrl) === normalizedBaseUrl) {
      return { key, ...preset }
    }
  }

  return null
}

export function getOpenAICompatDefaultModel(): ModelName {
  return (
    process.env.OPENAI_COMPAT_MODEL?.trim() ||
    getOpenAICompatProviderPreset()?.defaultModel ||
    'deepseek-v4-flash'
  )
}

export function getOpenAICompatModelForFamily(
  family: 'haiku' | 'opus' | 'sonnet',
): ModelName {
  const envModel = process.env.OPENAI_COMPAT_MODEL?.trim()
  if (envModel) {
    return envModel
  }

  const preset = getOpenAICompatProviderPreset()
  if (!preset) {
    return 'deepseek-v4-flash'
  }

  if (family === 'opus') {
    return preset.reasoningModel
  }

  if (family === 'haiku') {
    return preset.fastModel
  }

  return preset.defaultModel
}

export function getOpenAICompatModelOptions(): OpenAICompatProviderModelOption[] {
  const preset = getOpenAICompatProviderPreset()
  const envModel = process.env.OPENAI_COMPAT_MODEL?.trim()

  if (!preset) {
    return envModel
      ? [
          {
            id: envModel,
            label: envModel,
            description: 'Configured via OPENAI_COMPAT_MODEL',
          },
        ]
      : []
  }

  const options = [...preset.models]
  if (envModel && !options.some(option => option.id === envModel)) {
    options.unshift({
      id: envModel,
      label: envModel,
      description: 'Configured via OPENAI_COMPAT_MODEL',
    })
  }

  return options
}