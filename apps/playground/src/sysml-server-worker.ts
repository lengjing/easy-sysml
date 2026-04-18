/**
 * SysML Language Server Worker
 *
 * Web Worker entry point that starts the SysML language server.
 * Communicates with the main thread via LSP JSON-RPC over the Worker message channel.
 */

import { EmptyFileSystem } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser.js';
import { createSysMLBrowserServices } from '@easy-sysml/language-server/browser';

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
