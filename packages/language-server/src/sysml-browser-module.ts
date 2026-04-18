/**
 * SysML Language Module — Browser Edition
 *
 * Configures language services for SysML v2 that run entirely in the browser.
 * Omits Node-specific services (workspace manager, stdlib loader, process.env).
 */

import type { LangiumSharedServices, DefaultSharedModuleContext } from 'langium/lsp';
import type { LangiumCoreServices } from 'langium';
import { createDefaultModule, createDefaultSharedModule } from 'langium/lsp';
import { inject, type Module } from 'langium';
import {
  SysMLGeneratedModule,
  SysMLGeneratedSharedModule,
  KerMLGeneratedModule,
  SysMLLanguageMetaData,
  KerMLLanguageMetaData,
} from '@easy-sysml/grammar';
import { SysMLNameProvider } from './sysml-name-provider.js';
import { SysMLScopeComputation } from './sysml-scope-computation.js';
import { createSysMLScopeProvider } from './sysml-scope-provider.js';
import { SysMLDocumentSymbolProvider } from './sysml-document-symbol-provider.js';
import { SysMLHoverProvider } from './sysml-hover-provider.js';

export type SysMLServices = LangiumCoreServices;
export type KerMLServices = LangiumCoreServices;

const SysMLProductionMetaData = {
  ...SysMLLanguageMetaData,
  mode: 'production' as const,
};

const KerMLProductionMetaData = {
  ...KerMLLanguageMetaData,
  mode: 'production' as const,
};

/**
 * Create SysML and KerML language services suitable for browser environments.
 * Uses EmptyFileSystem — no stdlib loading, no Node.js workspace manager.
 */
export function createSysMLBrowserServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  SysML: SysMLServices;
  KerML: KerMLServices;
} {
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

const SysMLBrowserModule: Module<SysMLServices, any> = {
  LanguageMetaData: () => SysMLProductionMetaData,
  references: {
    NameProvider: () => new SysMLNameProvider(),
    ScopeComputation: (services: SysMLServices) => new SysMLScopeComputation(services),
    ScopeProvider: (services: SysMLServices) => createSysMLScopeProvider(services),
  },
  lsp: {
    DocumentSymbolProvider: (services: any) => new SysMLDocumentSymbolProvider(services),
    HoverProvider: (services: any) => new SysMLHoverProvider(services),
  },
};

const KerMLBrowserModule: Module<KerMLServices, any> = {
  LanguageMetaData: () => KerMLProductionMetaData,
  references: {
    NameProvider: () => new SysMLNameProvider(),
    ScopeComputation: (services: KerMLServices) => new SysMLScopeComputation(services),
    ScopeProvider: (services: KerMLServices) => createSysMLScopeProvider(services),
  },
  lsp: {
    DocumentSymbolProvider: (services: any) => new SysMLDocumentSymbolProvider(services),
    HoverProvider: (services: any) => new SysMLHoverProvider(services),
  },
};
