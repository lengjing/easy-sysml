/**
 * Tests for apps/ai-server/src/agent.ts
 *
 * Covers:
 *  - extractCodeBlocks() — code block extraction from markdown
 *  - SYSTEM_PROMPT content
 *  - runAgent() — mocked to verify generator behavior
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { extractCodeBlocks, SYSTEM_PROMPT } from '../agent.js';

/* ------------------------------------------------------------------ */
/*  Top-level mocks                                                   */
/* ------------------------------------------------------------------ */

// Mock tools to avoid real Langium initialization — do NOT importOriginal
// as that would trigger the @easy-sysml/language-server import chain
vi.mock('../tools.js', () => ({
  mcpTools: {},
  validateSysML: vi.fn().mockResolvedValue({ valid: true, diagnostics: [], summary: 'OK' }),
  validateSysmlTool: { description: 'Validate SysML', inputSchema: {} },
  getStdlibTypesTool: { description: 'Get stdlib', inputSchema: {} },
}));

// Default streamText mock — individual tests can override via mockReturnValue
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: vi.fn().mockReturnValue({
      textStream: (async function* () {
        // Empty stream by default
      })(),
    }),
    stepCountIs: vi.fn().mockReturnValue(() => false),
  };
});

/* ------------------------------------------------------------------ */
/*  Environment setup                                                 */
/* ------------------------------------------------------------------ */

beforeAll(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.AI_PROVIDER = 'gemini';
});

afterAll(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_PROVIDER;
});

/* ------------------------------------------------------------------ */
/*  extractCodeBlocks                                                  */
/* ------------------------------------------------------------------ */

describe('extractCodeBlocks()', () => {
  it('extracts a sysml code block', () => {
    const text = 'Here is some code:\n```sysml\npackage Foo {}\n```\nEnd.';
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe('package Foo {}');
  });

  it('extracts a kerml code block', () => {
    const text = '```kerml\nkernel Foo {}\n```';
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe('kernel Foo {}');
  });

  it('extracts multiple code blocks', () => {
    const text =
      '```sysml\npackage A {}\n```\nSome prose.\n```sysml\npackage B {}\n```';
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe('package A {}');
    expect(blocks[1]).toBe('package B {}');
  });

  it('returns empty array when no code blocks are present', () => {
    const text = 'No code blocks here.';
    expect(extractCodeBlocks(text)).toHaveLength(0);
  });

  it('handles empty text', () => {
    expect(extractCodeBlocks('')).toHaveLength(0);
  });

  it('trims whitespace from extracted code', () => {
    const text = '```sysml\n  package X {}  \n```';
    const blocks = extractCodeBlocks(text);
    expect(blocks[0]).toBe('package X {}');
  });

  it('also extracts plain ``` code fences (language tag is optional)', () => {
    const text = '```\nsome code\n```';
    // The regex uses an optional language specifier, so plain fences are also extracted
    const blocks = extractCodeBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe('some code');
  });
});

/* ------------------------------------------------------------------ */
/*  SYSTEM_PROMPT                                                     */
/* ------------------------------------------------------------------ */

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('mentions SysML v2', () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('sysml v2');
  });

  it('mentions validate_sysml tool', () => {
    expect(SYSTEM_PROMPT).toContain('validate_sysml');
  });

  it('mentions get_stdlib_types tool', () => {
    expect(SYSTEM_PROMPT).toContain('get_stdlib_types');
  });

  it('instructs to wrap code in sysml code blocks', () => {
    expect(SYSTEM_PROMPT).toContain('```sysml');
  });
});

/* ------------------------------------------------------------------ */
/*  runAgent() — mocked AI model                                      */
/* ------------------------------------------------------------------ */

describe('runAgent()', () => {
  it('yields a done event when the stream ends immediately', async () => {
    const { runAgent } = await import('../agent.js');
    const events: unknown[] = [];
    for await (const event of runAgent({
      messages: [{ role: 'user', content: 'hello' }],
      provider: 'gemini',
    })) {
      events.push(event);
    }

    const done = events.find((e: unknown) => (e as { type: string }).type === 'done');
    expect(done).toBeDefined();
  });

  it('yields delta events for plain text', async () => {
    const aiModule = await import('ai');
    vi.mocked(aiModule.streamText).mockReturnValueOnce({
      textStream: (async function* () {
        yield 'Hello, world!\n';
        yield 'How are you?\n';
      })(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { runAgent } = await import('../agent.js');
    const events: Array<{ type: string; content?: string }> = [];
    for await (const event of runAgent({
      messages: [{ role: 'user', content: 'hi' }],
      provider: 'gemini',
    })) {
      events.push(event as { type: string; content?: string });
    }

    const deltas = events.filter(e => e.type === 'delta');
    expect(deltas.length).toBeGreaterThan(0);
    const combined = deltas.map(d => d.content).join('');
    expect(combined).toContain('Hello');
  });

  it('yields a code event when sysml code block is streamed', async () => {
    const aiModule = await import('ai');
    vi.mocked(aiModule.streamText).mockReturnValueOnce({
      textStream: (async function* () {
        yield 'Here is the code:\n';
        yield '```sysml\n';
        yield 'package Test {}\n';
        yield '```\n';
      })(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { runAgent } = await import('../agent.js');
    const events: Array<{ type: string; content?: string; language?: string }> = [];
    for await (const event of runAgent({
      messages: [{ role: 'user', content: 'generate sysml' }],
      provider: 'gemini',
    })) {
      events.push(event as { type: string; content?: string; language?: string });
    }

    const codeEvent = events.find(e => e.type === 'code');
    expect(codeEvent).toBeDefined();
    expect(codeEvent?.content).toContain('package Test {}');
    expect(codeEvent?.language).toBe('sysml');
  });
});
