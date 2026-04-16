/**
 * SysML language server DI module.
 *
 * Wires Langium core + parser package + our LSP-specific providers
 * into a unified service container.
 */

import type {
  LangiumSharedCoreServices,
  Module,
  PartialLangiumCoreServices,
} from 'langium';
import type {
  LangiumServices,
  LangiumSharedServices,
  PartialLangiumSharedServices,
} from 'langium/lsp';
import {
  createDefaultModule,
  createDefaultSharedModule,
  type DefaultSharedModuleContext,
} from 'langium/lsp';
import { inject } from 'langium';
import {
  SysMLGeneratedModule,
  SysMLGeneratedSharedModule,
  KerMLGeneratedModule,
} from '@easy-sysml/parser/generated';
import { SysMLNameProvider, SysMLScopeComputation } from '@easy-sysml/parser';
import { SysMLCompletionProvider } from './lsp/completion-provider.js';
import { SysMLHoverProvider } from './lsp/hover-provider.js';
import { SysMLDiagnosticProvider } from './validation/diagnostic-provider.js';

/* ------------------------------------------------------------------ */
/*  Service type                                                       */
/* ------------------------------------------------------------------ */

export interface SysMLLanguageServer {
  shared: LangiumSharedServices;
  SysML: LangiumServices;
  KerML: LangiumServices;
}

/* ------------------------------------------------------------------ */
/*  Custom Modules                                                     */
/* ------------------------------------------------------------------ */

/**
 * Language-level overrides for SysML (and KerML).
 * Provides our custom name provider, scope computation,
 * completion, hover, and diagnostics.
 */
function createSysMLLSPModule(): Module<LangiumServices, PartialLangiumCoreServices> {
  return {
    references: {
      NameProvider: () => new SysMLNameProvider(),
      ScopeComputation: (services: LangiumServices) =>
        new SysMLScopeComputation(services),
    },
    lsp: {
      CompletionProvider: (services: LangiumServices) =>
        new SysMLCompletionProvider(services),
      HoverProvider: (services: LangiumServices) =>
        new SysMLHoverProvider(services),
    },
    validation: {
      DocumentValidator: (services: LangiumServices) =>
        new SysMLDiagnosticProvider(services),
    },
  } as Module<LangiumServices, PartialLangiumCoreServices>;
}

/**
 * Shared-level overrides (workspace-wide services).
 */
function createSysMLSharedLSPModule(): Module<LangiumSharedCoreServices, PartialLangiumSharedServices> {
  return {} as Module<LangiumSharedCoreServices, PartialLangiumSharedServices>;
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

/**
 * Create the full SysML language server with all services wired up.
 */
export function createSysMLLanguageServer(
  context: DefaultSharedModuleContext,
): SysMLLanguageServer {
  const shared = inject(
    createDefaultSharedModule(context),
    SysMLGeneratedSharedModule,
    createSysMLSharedLSPModule(),
  );

  const sysml = inject(
    createDefaultModule({ shared }),
    SysMLGeneratedModule,
    createSysMLLSPModule(),
  );

  const kerml = inject(
    createDefaultModule({ shared }),
    KerMLGeneratedModule,
    createSysMLLSPModule(),
  );

  shared.ServiceRegistry.register(sysml);
  shared.ServiceRegistry.register(kerml);

  return { shared, SysML: sysml, KerML: kerml };
}
