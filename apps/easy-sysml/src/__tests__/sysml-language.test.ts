import { describe, it, expect } from 'vitest';
import {
  sysmlMonarchTokens,
  sysmlLanguageConfiguration,
  SYSML_LANGUAGE_ID,
} from '../components/editor/sysml-language';

describe('sysml-language', () => {
  it('exports a language ID', () => {
    expect(SYSML_LANGUAGE_ID).toBe('sysml');
  });

  it('defines monarch tokenizer with root state', () => {
    expect(sysmlMonarchTokens.tokenizer).toBeDefined();
    expect(sysmlMonarchTokens.tokenizer.root).toBeDefined();
    expect(Array.isArray(sysmlMonarchTokens.tokenizer.root)).toBe(true);
    expect(sysmlMonarchTokens.tokenizer.root.length).toBeGreaterThan(0);
  });

  it('includes SysML keywords', () => {
    const keywords = sysmlMonarchTokens.keywords as string[];
    expect(keywords).toContain('package');
    expect(keywords).toContain('part');
    expect(keywords).toContain('port');
    expect(keywords).toContain('action');
    expect(keywords).toContain('state');
    expect(keywords).toContain('requirement');
    expect(keywords).toContain('constraint');
    expect(keywords).toContain('def');
    expect(keywords).toContain('abstract');
    expect(keywords).toContain('block');
    expect(keywords).toContain('attribute');
    expect(keywords).toContain('import');
  });

  it('includes type keywords', () => {
    const typeKeywords = sysmlMonarchTokens.typeKeywords as string[];
    expect(typeKeywords).toContain('Boolean');
    expect(typeKeywords).toContain('Integer');
    expect(typeKeywords).toContain('Real');
    expect(typeKeywords).toContain('String');
  });

  it('has comment and string tokenizer states', () => {
    expect(sysmlMonarchTokens.tokenizer.comment).toBeDefined();
    expect(sysmlMonarchTokens.tokenizer.string).toBeDefined();
  });

  it('configures line and block comments', () => {
    expect(sysmlLanguageConfiguration.comments?.lineComment).toBe('//');
    expect(sysmlLanguageConfiguration.comments?.blockComment).toEqual(['/*', '*/']);
  });

  it('configures brackets', () => {
    expect(sysmlLanguageConfiguration.brackets).toEqual([
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ]);
  });

  it('configures auto-closing pairs', () => {
    const pairs = sysmlLanguageConfiguration.autoClosingPairs;
    expect(pairs).toBeDefined();
    expect(pairs!.length).toBeGreaterThan(0);
    // Should include braces
    expect(pairs!.some(p => (p as { open: string }).open === '{')).toBe(true);
  });
});
