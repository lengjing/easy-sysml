/**
 * SysML Language Server Worker
 *
 * Web Worker entry point that starts the SysML language server.
 * Communicates with the main thread via LSP JSON-RPC over the Worker message channel.
 *
 * Before starting the server, loads the SysML standard library (94 files)
 * into the Langium workspace so that types like Real, Integer, etc. resolve.
 */

import { EmptyFileSystem } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser.js';
import { createSysMLBrowserServices } from '@easy-sysml/language-server/browser';
import { STDLIB_FILES } from './generated/stdlib-bundle';
import { loadStdlibBrowser } from './stdlib-loader';

/* eslint-disable @typescript-eslint/no-explicit-any */
const worker = globalThis as any;

const messageReader = new BrowserMessageReader(worker);
const messageWriter = new BrowserMessageWriter(worker);

const connection = createConnection(messageReader, messageWriter);

const { shared } = createSysMLBrowserServices({
  connection,
  ...EmptyFileSystem,
});

// Load stdlib before starting the server so that types like Real, Integer,
// Wheel, Engine, etc. are available in the workspace for reference resolution.
loadStdlibBrowser(shared, STDLIB_FILES).then((result) => {
  if (result.success) {
    console.log(`[worker] Stdlib loaded: ${result.filesLoaded} files in ${result.loadTimeMs}ms`);
  } else {
    console.warn(`[worker] Stdlib load issues:`, result.errors);
  }

  // Start the language server after stdlib is loaded
  startLanguageServer(shared);
}).catch((err) => {
  console.error('[worker] Failed to load stdlib:', err);
  // Start server anyway — it will work without stdlib (with linking errors)
  startLanguageServer(shared);
});
