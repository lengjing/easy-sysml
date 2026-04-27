import { beforeEach, describe, expect, it } from 'vitest'
import { isAnthropicAuthEnabled } from '../auth.ts'

describe('isAnthropicAuthEnabled()', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'dummy'
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_OPENAI_COMPAT
    delete process.env.ANTHROPIC_UNIX_SOCKET
    delete process.env.ANTHROPIC_AUTH_TOKEN
    delete process.env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR
  })

  it('disables Anthropic auth for openai-compat provider', () => {
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT = '1'

    expect(isAnthropicAuthEnabled()).toBe(false)
  })

  it('keeps Anthropic auth enabled for openai provider', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'

    expect(isAnthropicAuthEnabled()).toBe(true)
  })
})