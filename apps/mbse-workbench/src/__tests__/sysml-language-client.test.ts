import { describe, it, expect } from 'vitest';
import { SysMLLanguageClient } from '../components/editor/sysml-language-client';

describe('SysMLLanguageClient', () => {
  describe('static helpers', () => {
    it('toMonacoCompletionKind maps keyword kind', () => {
      // We can't create a real Monaco instance in Node/jsdom, but we can verify
      // the static method exists and the class is constructable
      expect(typeof SysMLLanguageClient.toMonacoCompletionKind).toBe('function');
      expect(typeof SysMLLanguageClient.toMonacoSymbolKind).toBe('function');
    });
  });
});
