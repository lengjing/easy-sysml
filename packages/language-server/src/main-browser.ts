/**
 * SysML v2 Language Server — Browser Worker Entry Point
 *
 * Runs as a Web Worker. The host page communicates via the
 * standard LSP JSON-RPC protocol over the Worker message channel.
 *
 * Before starting the server, loads the SysML standard library (94 files)
 * into the Langium workspace so that types like Real, Integer, etc. resolve.
 *
 * Usage from the main thread:
 *   const worker = new Worker(new URL('./main-browser.js', import.meta.url));
 *   // then connect via BrowserMessageReader/BrowserMessageWriter
 */

import { EmptyFileSystem } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser.js';
import { createSysMLBrowserServices } from './sysml-browser-module.js';
import { STDLIB_FILES, loadStdlibBrowser } from '@easy-sysml/stdlib/browser';

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
// etc. are available in the workspace for reference resolution.
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
