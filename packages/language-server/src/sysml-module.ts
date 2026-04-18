/**
 * SysML Language Module
 *
 * Configures and provides all language services for SysML v2,
 * including validation, completion, navigation, and hover.
 *
 * Dual Language Architecture:
 * - SysML grammar for .sysml files (no 'var' keyword)
 * - KerML grammar for .kerml files (with 'var' keyword)
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
import { FilteringDocumentValidator } from './validation/filtering-document-validator.js';
import { SysMLDocumentSymbolProvider } from './sysml-document-symbol-provider.js';
import { SysMLHoverProvider } from './sysml-hover-provider.js';
import { SysMLWorkspaceManager } from './workspace-manager.js';

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
 * Create SysML and KerML language services with all customizations.
 */
export function createSysMLServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  SysML: SysMLServices;
  KerML: KerMLServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    SysMLGeneratedSharedModule,
    SysMLSharedModule,
  );

  const SysML = inject(
    createDefaultModule({ shared }),
    SysMLGeneratedModule,
    SysMLModule,
  );

  const KerML = inject(
    createDefaultModule({ shared }),
    KerMLGeneratedModule,
    KerMLModule,
  );

  shared.ServiceRegistry.register(SysML);
  shared.ServiceRegistry.register(KerML);

  return { shared, SysML, KerML };
}

const SysMLSharedModule: Module<LangiumSharedServices, any> = {
  workspace: {
    WorkspaceManager: (services: LangiumSharedServices) => new SysMLWorkspaceManager(services),
  },
};

const SysMLModule: Module<SysMLServices, any> = {
  LanguageMetaData: () => SysMLProductionMetaData,
  references: {
    NameProvider: () => new SysMLNameProvider(),
    ScopeComputation: (services: SysMLServices) => new SysMLScopeComputation(services),
    ScopeProvider: (services: SysMLServices) => createSysMLScopeProvider(services),
  },
  validation: {
    DocumentValidator: (services: SysMLServices) => new FilteringDocumentValidator(services),
  },
  lsp: {
    DocumentSymbolProvider: (services: any) => new SysMLDocumentSymbolProvider(services),
    HoverProvider: (services: any) => new SysMLHoverProvider(services),
  },
};

const KerMLModule: Module<KerMLServices, any> = {
  LanguageMetaData: () => KerMLProductionMetaData,
  references: {
    NameProvider: () => new SysMLNameProvider(),
    ScopeComputation: (services: KerMLServices) => new SysMLScopeComputation(services),
    ScopeProvider: (services: KerMLServices) => createSysMLScopeProvider(services),
  },
  validation: {
    DocumentValidator: (services: KerMLServices) => new FilteringDocumentValidator(services),
  },
  lsp: {
    DocumentSymbolProvider: (services: any) => new SysMLDocumentSymbolProvider(services),
    HoverProvider: (services: any) => new SysMLHoverProvider(services),
  },
};
