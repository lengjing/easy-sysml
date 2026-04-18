/**
 * @easy-sysml/grammar
 *
 * SysML v2 / KerML grammar definitions, generated AST types, and Langium modules.
 * Also provides a standalone parsing API for convenience.
 */

// Re-export generated Langium AST types and modules
export * from './generated/ast.js';
export * from './generated/grammar.js';
export * from './generated/module.js';

// Standalone parser API
export { parseSysML, disposeParser } from './parser.js';
export type { ParseResult, ParseErrorInfo } from './parser.js';
