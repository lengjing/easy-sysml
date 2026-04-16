/**
 * @easy-sysml/language-server — public API
 */

export { startLanguageServer } from './main.js';
export { createSysMLLanguageServer } from './server-module.js';
export type { SysMLLanguageServer } from './server-module.js';

// Re-export LSP feature providers
export { SysMLCompletionProvider } from './lsp/completion-provider.js';
export { SysMLHoverProvider } from './lsp/hover-provider.js';
export { SysMLDiagnosticProvider } from './validation/diagnostic-provider.js';
