/**
 * @easy-sysml/parser — SysML v2 parser package
 *
 * Provides Langium-based parsing, AST types, validation, and symbol resolution
 * for SysML v2 and KerML languages.
 */

// Re-export generated AST types
export * from './generated/ast.js';
export * from './generated/module.js';

// Parser API
export { parseSysML, parseKerML, createParsingServices, disposeParser } from './parser.js';
export type { ParseResult, ParseError, ParsingServices } from './parser.js';

// Validation
export { SysMLValidator, type ValidationResult, type ValidationDiagnostic } from './validation.js';

// Services module
export { createSysMLModule, type SysMLAddedServices, type SysMLServices } from './sysml-module.js';

// Scope computation
export { SysMLScopeComputation } from './scope-computation.js';

// Name provider
export { SysMLNameProvider } from './name-provider.js';
