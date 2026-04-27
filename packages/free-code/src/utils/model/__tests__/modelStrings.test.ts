import { beforeEach, describe, expect, it } from 'vitest'
import { resetModelStringsForTestingOnly } from 'src/bootstrap/state.js'
import { getModelStrings } from '../modelStrings.ts'

describe('getModelStrings()', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_USE_OPENAI
    process.env.CLAUDE_CODE_USE_OPENAI_COMPAT = '1'
    resetModelStringsForTestingOnly()
  })

  it('reuses openai model strings for openai-compat provider', () => {
    const modelStrings = getModelStrings()

    expect(modelStrings.sonnet45).toBe('claude-sonnet-4-5-20250929')
    expect(modelStrings.haiku45).toBe('claude-haiku-4-5-20251001')
    expect(modelStrings.gpt54).toBe('gpt-5.4')
  })
})