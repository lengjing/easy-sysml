/**
 * SysML v2 Language Server — Browser Worker Entry Point
 *
 * Runs as a Web Worker. The host page communicates via the
 * standard LSP JSON-RPC protocol over the Worker message channel.
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

/* eslint-disable @typescript-eslint/no-explicit-any */
const worker = globalThis as any;

const messageReader = new BrowserMessageReader(worker);
const messageWriter = new BrowserMessageWriter(worker);

const connection = createConnection(messageReader, messageWriter);

const { shared } = createSysMLBrowserServices({
  connection,
  ...EmptyFileSystem,
});

startLanguageServer(shared);
