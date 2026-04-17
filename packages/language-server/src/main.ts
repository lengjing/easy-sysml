/**
 * SysML v2 Language Server — Entry Point
 *
 * Starts the LSP connection and initializes SysML language services.
 */

import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';
import { createSysMLServices } from './sysml-module.js';

export { createSysMLServices } from './sysml-module.js';

/**
 * Suppress Chevrotain "Ambiguous Alternatives Detected" warnings
 * that clutter the output during parser construction.
 */
function suppressChevrotainWarnings<T>(fn: () => T): T {
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const msg = String(args[0] || '');
    if (
      msg.includes('Ambiguous Alternatives Detected') ||
      msg.includes('may appears as a prefix path') ||
      msg.includes('AMBIGUOUS_ALTERNATIVES')
    ) {
      return;
    }
    originalLog.apply(console, args);
  };
  try {
    return fn();
  } finally {
    console.log = originalLog;
  }
}

export function startServer(): void {
  const connection = createConnection(ProposedFeatures.all);

  const { shared } = suppressChevrotainWarnings(() =>
    createSysMLServices({ connection, ...NodeFileSystem }),
  );

  connection.onInitialized(() => {
    connection.console.log('[SysML] Language Server initialized and ready.');
  });

  startLanguageServer(shared);
}

// Auto-start when run directly
if (typeof require !== 'undefined' && require.main === module) {
  startServer();
} else if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('main.js') || process.argv[1].endsWith('sysml-language-server.js'))
) {
  startServer();
}
