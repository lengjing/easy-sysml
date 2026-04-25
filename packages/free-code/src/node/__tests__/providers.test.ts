/**
 * Tests for the multi-provider client factory.
 *
 * Mirrors free-code's provider selection logic from
 * `src/utils/model/providers.ts`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getAPIProvider,
  getDefaultModel,
  createAPIClient,
} from '../providers.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = v
    }
  }
}

function clearProviderEnv() {
  setEnv({
    CLAUDE_CODE_USE_BEDROCK: undefined,
    CLAUDE_CODE_USE_VERTEX: undefined,
    CLAUDE_CODE_USE_FOUNDRY: undefined,
    CLAUDE_CODE_USE_OPENAI: undefined,
  })
}

// ---------------------------------------------------------------------------
// getAPIProvider
// ---------------------------------------------------------------------------

describe('getAPIProvider', () => {
  beforeEach(clearProviderEnv)
  afterEach(clearProviderEnv)

  it('returns "firstParty" by default', () => {
    expect(getAPIProvider()).toBe('firstParty')
  })

  it('returns "bedrock" when CLAUDE_CODE_USE_BEDROCK=1', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(getAPIProvider()).toBe('bedrock')
  })

  it('returns "bedrock" when CLAUDE_CODE_USE_BEDROCK=true', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = 'true'
    expect(getAPIProvider()).toBe('bedrock')
  })

  it('returns "vertex" when CLAUDE_CODE_USE_VERTEX=1', () => {
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(getAPIProvider()).toBe('vertex')
  })

  it('returns "foundry" when CLAUDE_CODE_USE_FOUNDRY=1', () => {
    process.env.CLAUDE_CODE_USE_FOUNDRY = '1'
    expect(getAPIProvider()).toBe('foundry')
  })

  it('returns "openai" when CLAUDE_CODE_USE_OPENAI=1', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    expect(getAPIProvider()).toBe('openai')
  })

  it('bedrock takes priority over vertex when both set', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(getAPIProvider()).toBe('bedrock')
  })
})

// ---------------------------------------------------------------------------
// getDefaultModel
// ---------------------------------------------------------------------------

describe('getDefaultModel', () => {
  beforeEach(() => {
    clearProviderEnv()
    delete process.env.ANTHROPIC_MODEL
    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
  })
  afterEach(() => {
    clearProviderEnv()
    delete process.env.ANTHROPIC_MODEL
    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
  })

  it('returns sonnet default for firstParty', () => {
    expect(getDefaultModel('firstParty')).toBe('claude-sonnet-4-6')
  })

  it('respects ANTHROPIC_MODEL for firstParty', () => {
    process.env.ANTHROPIC_MODEL = 'claude-opus-4-6'
    expect(getDefaultModel('firstParty')).toBe('claude-opus-4-6')
  })

  it('respects ANTHROPIC_DEFAULT_SONNET_MODEL for firstParty', () => {
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'claude-sonnet-4-5'
    expect(getDefaultModel('firstParty')).toBe('claude-sonnet-4-5')
  })

  it('ANTHROPIC_MODEL takes priority over ANTHROPIC_DEFAULT_SONNET_MODEL', () => {
    process.env.ANTHROPIC_MODEL = 'claude-opus-4'
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'claude-sonnet-4-5'
    expect(getDefaultModel('firstParty')).toBe('claude-opus-4')
  })

  it('returns bedrock model format', () => {
    const model = getDefaultModel('bedrock')
    expect(model).toMatch(/us\.anthropic\.claude/)
  })

  it('returns vertex model format with @latest', () => {
    const model = getDefaultModel('vertex')
    expect(model).toMatch(/@latest$/)
  })

  it('returns openai model for openai provider', () => {
    expect(getDefaultModel('openai')).toBe('gpt-5.3-codex')
  })
})

// ---------------------------------------------------------------------------
// createAPIClient — firstParty (mocked)
// ---------------------------------------------------------------------------

describe('createAPIClient', () => {
  beforeEach(clearProviderEnv)
  afterEach(clearProviderEnv)

  it('creates firstParty client when no provider env var set', async () => {
    // Mock @anthropic-ai/sdk to avoid needing a real API key
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class MockAnthropic {
        constructor(public opts: Record<string, unknown>) {}
        messages = { stream: vi.fn(), create: vi.fn() }
      },
    }))

    // Since we're using dynamic import inside createAPIClient, we test that
    // the function doesn't throw (the SDK mock is in place)
    const client = await createAPIClient({ apiKey: 'test-key' })
    expect(client).toBeDefined()
    expect(client.messages).toBeDefined()

    vi.doUnmock('@anthropic-ai/sdk')
  })

  it('throws a helpful error when bedrock SDK is not installed', async () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'

    vi.doMock('@anthropic-ai/bedrock-sdk', () => {
      throw new Error('Cannot find module')
    })

    await expect(createAPIClient()).rejects.toThrow(
      /bedrock.*@anthropic-ai\/bedrock-sdk/i,
    )

    vi.doUnmock('@anthropic-ai/bedrock-sdk')
  })

  it('throws a helpful error when vertex SDK is not installed', async () => {
    process.env.CLAUDE_CODE_USE_VERTEX = '1'

    vi.doMock('@anthropic-ai/vertex-sdk', () => {
      throw new Error('Cannot find module')
    })

    await expect(createAPIClient()).rejects.toThrow(
      /vertex.*@anthropic-ai\/vertex-sdk/i,
    )

    vi.doUnmock('@anthropic-ai/vertex-sdk')
  })

  it('throws a helpful error when foundry SDK is not installed', async () => {
    process.env.CLAUDE_CODE_USE_FOUNDRY = '1'

    vi.doMock('@anthropic-ai/foundry-sdk', () => {
      throw new Error('Cannot find module')
    })

    await expect(createAPIClient()).rejects.toThrow(
      /foundry.*@anthropic-ai\/foundry-sdk/i,
    )

    vi.doUnmock('@anthropic-ai/foundry-sdk')
  })
})
