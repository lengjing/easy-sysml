/**
 * @easy-sysml/parser
 *
 * SysML v2 / KerML parser built on Langium.
 * Exports generated AST types, Langium modules, and a standalone parsing API.
 */

// Re-export generated Langium AST types and modules
export * from './generated/ast.js';
export * from './generated/grammar.js';
export * from './generated/module.js';

// Standalone parser API
export { parseSysML, disposeParser } from './parser.js';
export type { ParseResult, ParseErrorInfo } from './parser.js';
