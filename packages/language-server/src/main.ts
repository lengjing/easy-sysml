/**
 * Language server entry point — starts the SysML v2 LSP server.
 *
 * This module creates a Node.js-based LSP connection and wires up the
 * Langium services with our custom SysML providers.
 */

import {
  createConnection,
  ProposedFeatures,
} from 'vscode-languageserver/node.js';
import { createSysMLLanguageServer } from './server-module.js';
import { NodeFileSystem } from 'langium/node';
import { startLanguageServer as langiumStartServer } from 'langium/lsp';

/**
 * Start the SysML v2 language server on stdio.
 */
export function startLanguageServer(): void {
  const connection = createConnection(ProposedFeatures.all);
  const { shared } = createSysMLLanguageServer({
    connection,
    ...NodeFileSystem,
  });
  langiumStartServer(shared);
}
