/**
 * SysML Language Server Worker
 *
 * Creates a Web Worker running the SysML language server.
 * The worker communicates over the standard LSP JSON-RPC protocol
 * via the Worker message channel.
 *
 * This file is the worker entry point bundled by Vite.
 * It uses the browser-compatible language server module from
 * @easy-sysml/language-server.
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
