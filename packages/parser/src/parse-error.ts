// ---------------------------------------------------------------------------
// Parse error types and recovery utilities
// ---------------------------------------------------------------------------

import type { Range } from '@easy-sysml/protocol';

// ---------------------------------------------------------------------------
// ParseError
// ---------------------------------------------------------------------------

/**
 * A structured parse error carrying source location, machine-readable code,
 * and optional recovery suggestions.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly range: Range,
    public readonly code: string = 'parse-error',
    public readonly suggestions: string[] = [],
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const ErrorCode = {
  UnexpectedToken: 'unexpected-token',
  ExpectedToken: 'expected-token',
  ExpectedIdentifier: 'expected-identifier',
  ExpectedSemicolon: 'expected-semicolon',
  ExpectedLBrace: 'expected-lbrace',
  ExpectedRBrace: 'expected-rbrace',
  UnexpectedEOF: 'unexpected-eof',
  InvalidMember: 'invalid-member',
  InvalidMultiplicity: 'invalid-multiplicity',
  UnterminatedComment: 'unterminated-comment',
  UnterminatedString: 'unterminated-string',
} as const;

// ---------------------------------------------------------------------------
// ErrorRecovery
// ---------------------------------------------------------------------------

/**
 * Utilities for recovering from parse errors so the parser can continue
 * producing a partial AST.
 */
export class ErrorRecovery {
  /** Token kinds that indicate the start of a new top-level declaration. */
  private static readonly SYNC_KINDS = new Set([
    'Package', 'Part', 'Attribute', 'Action', 'State', 'Requirement',
    'Port', 'Connection', 'Interface', 'Item', 'Flow', 'Import', 'Enum',
    'Constraint', 'Comment', 'Doc', 'Abstract', 'Public', 'Private',
    'Protected', 'Metadata',
  ]);

  /**
   * Determine whether the given token kind is a synchronisation point
   * (i.e. the likely start of a new declaration).
   */
  static isSyncPoint(tokenKind: string): boolean {
    return ErrorRecovery.SYNC_KINDS.has(tokenKind);
  }

  /** Build a user-friendly "expected X, got Y" message. */
  static expectedMessage(expected: string, got: string): string {
    if (got === 'EOF') {
      return `Expected ${expected} but reached end of file`;
    }
    return `Expected ${expected}, got '${got}'`;
  }
}
