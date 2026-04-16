// ---------------------------------------------------------------------------
// Incremental parsing support
// ---------------------------------------------------------------------------

import type { Range, TextDocumentContentChangeEvent } from '@easy-sysml/protocol';
import type { ASTNode } from '@easy-sysml/ast';
import type { Token } from './lexer.js';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import type { ParseResult } from './parser.js';

// ---------------------------------------------------------------------------
// IncrementalParser
// ---------------------------------------------------------------------------

/**
 * Wraps the base {@link Parser} with a simple cache so that unchanged
 * documents are not re-parsed, and provides a convenience method for
 * applying incremental text changes.
 */
export class IncrementalParser {
  private cache = new Map<string, { version: number; result: ParseResult; text: string }>();
  private lexer = new Lexer();
  private parser = new Parser();

  /**
   * Parse a document, returning a cached result when the content has not
   * changed.
   */
  parseDocument(uri: string, text: string, version: number): ParseResult {
    const cached = this.cache.get(uri);
    if (cached && cached.version === version && cached.text === text) {
      return cached.result;
    }

    const tokens = this.lexer.tokenize(text);
    const result = this.parser.parse(tokens, uri);
    this.cache.set(uri, { version, result, text });
    return result;
  }

  /**
   * Apply an incremental content change and re-parse. For now this
   * performs a full re-lex and re-parse of the updated text. A future
   * optimisation can limit re-lexing to the changed region.
   */
  reparseRange(
    uri: string,
    oldText: string,
    change: TextDocumentContentChangeEvent,
    version: number,
  ): ParseResult {
    let newText: string;

    if (change.range) {
      const before = this.getOffsetFromPosition(oldText, change.range.start);
      const after = this.getOffsetFromPosition(oldText, change.range.end);
      newText = oldText.slice(0, before) + change.text + oldText.slice(after);
    } else {
      // Full document replacement
      newText = change.text;
    }

    return this.parseDocument(uri, newText, version);
  }

  /** Evict a document from the cache. */
  invalidate(uri: string): void {
    this.cache.delete(uri);
  }

  /** Clear all cached parse results. */
  clearCache(): void {
    this.cache.clear();
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private getOffsetFromPosition(text: string, pos: { line: number; character: number }): number {
    let offset = 0;
    let line = 0;
    while (line < pos.line && offset < text.length) {
      if (text[offset] === '\n') line++;
      offset++;
    }
    return offset + pos.character;
  }
}
