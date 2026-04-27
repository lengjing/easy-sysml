import { beforeEach, describe, expect, it } from 'vitest'
import { resetModelStringsForTestingOnly } from 'src/bootstrap/state.js'
import {
  getDefaultMainLoopModel,
  getDefaultOpusModel,
  renderDefaultModelSetting,
} from '../model.ts'
import { getModelOptions } from '../modelOptions.ts'

describe('openai-compat model defaults and options', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'dummy'
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT = '1'
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_COMPAT_MODEL
    delete process.env.OPENAI_COMPAT_BASE_URL
    resetModelStringsForTestingOnly()
  })

  it('uses DeepSeek defaults and exposes DeepSeek native models', () => {
    process.env.OPENAI_COMPAT_PROVIDER = 'deepseek'

    expect(getDefaultMainLoopModel()).toBe('deepseek-v4-flash')
    expect(getDefaultOpusModel()).toBe('deepseek-v4-pro')
    expect(renderDefaultModelSetting(getDefaultMainLoopModel())).toBe(
      'DeepSeek V4 Flash',
    )

    const optionValues = getModelOptions().map(option => option.value)
    expect(optionValues).toContain('deepseek-v4-flash')
    expect(optionValues).toContain('deepseek-v4-pro')
    expect(optionValues).toContain('deepseek-chat')
    expect(optionValues).toContain('deepseek-reasoner')
    expect(optionValues).not.toContain('claude-sonnet-4-6')
  })

  it('uses Qwen defaults and exposes Qwen native models', () => {
    process.env.OPENAI_COMPAT_PROVIDER = 'qwen'
    resetModelStringsForTestingOnly()

    expect(getDefaultMainLoopModel()).toBe('qwen-plus')
    expect(getDefaultOpusModel()).toBe('qwen-max')

    const optionValues = getModelOptions().map(option => option.value)
    expect(optionValues).toContain('qwen-plus')
    expect(optionValues).toContain('qwen-max')
    expect(optionValues).not.toContain('claude-opus-4-6')
  })
})