/**
 * SysML Language Server Worker
 *
 * Creates a Web Worker running the SysML language server.
 * The worker communicates over the standard LSP JSON-RPC protocol
 * via the Worker message channel.
 *
 * This file is the worker entry point bundled by Vite.
 * It directly bootstraps the browser-compatible language server
 * using the same pattern as @easy-sysml/language-server/main-browser.
 */

import { EmptyFileSystem, inject, type Module } from 'langium';
import {
  createDefaultModule,
  createDefaultSharedModule,
  startLanguageServer,
} from 'langium/lsp';
import type { LangiumCoreServices } from 'langium';
import type { LangiumSharedServices, DefaultSharedModuleContext } from 'langium/lsp';
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser.js';
import {
  SysMLGeneratedModule,
  SysMLGeneratedSharedModule,
  KerMLGeneratedModule,
  SysMLLanguageMetaData,
  KerMLLanguageMetaData,
} from '@easy-sysml/parser';

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ */
/*  Browser-compatible SysML services (no Node.js dependencies)       */
/* ------------------------------------------------------------------ */

function createSysMLBrowserServices(context: DefaultSharedModuleContext) {
  const SysMLProductionMetaData = { ...SysMLLanguageMetaData, mode: 'production' as const };
  const KerMLProductionMetaData = { ...KerMLLanguageMetaData, mode: 'production' as const };

  const SysMLBrowserModule: Module<LangiumCoreServices, any> = {
    LanguageMetaData: () => SysMLProductionMetaData,
  };

  const KerMLBrowserModule: Module<LangiumCoreServices, any> = {
    LanguageMetaData: () => KerMLProductionMetaData,
  };

  const shared = inject(
    createDefaultSharedModule(context),
    SysMLGeneratedSharedModule,
  );
  const SysML = inject(
    createDefaultModule({ shared }),
    SysMLGeneratedModule,
    SysMLBrowserModule,
  );
  const KerML = inject(
    createDefaultModule({ shared }),
    KerMLGeneratedModule,
    KerMLBrowserModule,
  );
  shared.ServiceRegistry.register(SysML);
  shared.ServiceRegistry.register(KerML);
  return { shared, SysML, KerML };
}

/* ------------------------------------------------------------------ */
/*  Worker bootstrap                                                  */
/* ------------------------------------------------------------------ */

const worker = globalThis as any;

const messageReader = new BrowserMessageReader(worker);
const messageWriter = new BrowserMessageWriter(worker);

const connection = createConnection(messageReader, messageWriter);

const { shared } = createSysMLBrowserServices({
  connection,
  ...EmptyFileSystem,
});

startLanguageServer(shared);
