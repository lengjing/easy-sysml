// ---------------------------------------------------------------------------
// @easy-sysml/parser – barrel export
// ---------------------------------------------------------------------------

export { Lexer, TokenKind } from './lexer.js';
export type { Token } from './lexer.js';

export { Parser } from './parser.js';
export type { ParseResult } from './parser.js';

export { ParseError, ErrorCode, ErrorRecovery } from './parse-error.js';

export { IncrementalParser } from './incremental.js';
