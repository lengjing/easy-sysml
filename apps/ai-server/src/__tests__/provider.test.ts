/**
 * Tests for apps/ai-server/src/provider.ts
 *
 * Covers:
 *  - getProvider() env-based selection
 *  - getApiKey()
 *  - getModelId() with and without AI_MODEL override
 *  - createModel() — only exercises the factory; actual API calls are not made
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AIProvider } from '../provider.js';

/* ------------------------------------------------------------------ */
/*  getProvider                                                       */
/* ------------------------------------------------------------------ */

describe('getProvider()', () => {
  beforeEach(() => {
    // Clear all relevant env vars before each test
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns "gemini" when AI_PROVIDER=gemini', async () => {
    process.env.AI_PROVIDER = 'gemini';
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('gemini');
  });

  it('returns "deepseek" when AI_PROVIDER=deepseek', async () => {
    process.env.AI_PROVIDER = 'deepseek';
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('deepseek');
  });

  it('returns "qwen" when AI_PROVIDER=qwen', async () => {
    process.env.AI_PROVIDER = 'qwen';
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('qwen');
  });

  it('returns "openai-compatible" when AI_PROVIDER=openai-compatible', async () => {
    process.env.AI_PROVIDER = 'openai-compatible';
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('openai-compatible');
  });

  it('auto-detects gemini from GEMINI_API_KEY', async () => {
    delete process.env.AI_PROVIDER;
    process.env.GEMINI_API_KEY = 'test-key';
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('gemini');
  });

  it('auto-detects deepseek from DEEPSEEK_API_KEY', async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'test-key';
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('deepseek');
  });

  it('auto-detects qwen from QWEN_API_KEY', async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    process.env.QWEN_API_KEY = 'test-key';
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('qwen');
  });

  it('auto-detects openai-compatible from OPENAI_API_KEY', async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('openai-compatible');
  });

  it('falls back to "gemini" when no keys or provider are set', async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { getProvider } = await import('../provider.js');
    expect(getProvider()).toBe('gemini');
  });
});

/* ------------------------------------------------------------------ */
/*  getApiKey                                                         */
/* ------------------------------------------------------------------ */

describe('getApiKey()', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  const cases: [AIProvider, string, string][] = [
    ['gemini', 'GEMINI_API_KEY', 'gemini-key-123'],
    ['deepseek', 'DEEPSEEK_API_KEY', 'ds-key-456'],
    ['qwen', 'QWEN_API_KEY', 'qwen-key-789'],
    ['openai-compatible', 'OPENAI_API_KEY', 'openai-key-abc'],
  ];

  it.each(cases)('returns %s key from %s', async (provider, envVar, value) => {
    process.env[envVar] = value;
    const { getApiKey } = await import('../provider.js');
    expect(getApiKey(provider)).toBe(value);
  });

  it('returns empty string when key is not set', async () => {
    const { getApiKey } = await import('../provider.js');
    expect(getApiKey('gemini')).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/*  getModelId                                                        */
/* ------------------------------------------------------------------ */

describe('getModelId()', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.AI_MODEL;
  });

  it('returns default model for gemini', async () => {
    const { getModelId, PROVIDER_PRESETS } = await import('../provider.js');
    expect(getModelId('gemini')).toBe(PROVIDER_PRESETS.gemini.defaultModel);
  });

  it('returns default model for deepseek', async () => {
    const { getModelId, PROVIDER_PRESETS } = await import('../provider.js');
    expect(getModelId('deepseek')).toBe(PROVIDER_PRESETS.deepseek.defaultModel);
  });

  it('returns default model for qwen', async () => {
    const { getModelId, PROVIDER_PRESETS } = await import('../provider.js');
    expect(getModelId('qwen')).toBe(PROVIDER_PRESETS.qwen.defaultModel);
  });

  it('respects AI_MODEL override', async () => {
    process.env.AI_MODEL = 'custom-model-v2';
    const { getModelId } = await import('../provider.js');
    expect(getModelId('gemini')).toBe('custom-model-v2');
  });
});

/* ------------------------------------------------------------------ */
/*  PROVIDER_PRESETS completeness                                     */
/* ------------------------------------------------------------------ */

describe('PROVIDER_PRESETS', () => {
  it('has entries for all supported providers', async () => {
    const { PROVIDER_PRESETS } = await import('../provider.js');
    const required: AIProvider[] = ['gemini', 'deepseek', 'qwen', 'openai-compatible'];
    for (const p of required) {
      expect(PROVIDER_PRESETS[p]).toBeDefined();
      expect(PROVIDER_PRESETS[p].label).toBeTruthy();
      expect(PROVIDER_PRESETS[p].defaultModel).toBeTruthy();
    }
  });

  it('deepseek preset has correct base URL', async () => {
    const { PROVIDER_PRESETS } = await import('../provider.js');
    expect(PROVIDER_PRESETS.deepseek.baseURL).toContain('deepseek.com');
  });

  it('qwen preset has correct base URL', async () => {
    const { PROVIDER_PRESETS } = await import('../provider.js');
    expect(PROVIDER_PRESETS.qwen.baseURL).toContain('dashscope.aliyuncs.com');
  });
});
