// @easy-sysml/parser – barrel export (Langium-based)

// Re-export generated AST types
export * from './generated/ast.js';

// Re-export Langium modules for LSP integration
export {
  SysMLGeneratedModule,
  SysMLGeneratedSharedModule,
  KerMLGeneratedModule,
  SysMLLanguageMetaData,
  KerMLLanguageMetaData,
} from './generated/module.js';

// Standalone parser API
export { parseSysML, disposeParser } from './parser.js';
export type { ParseResult, ParseErrorInfo } from './parser.js';

// AST bridge
export { bridgeAst } from './ast-bridge.js';
