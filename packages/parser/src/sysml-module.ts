/**
 * SysML dependency-injection module — wires custom services into Langium.
 *
 * This module registers the SysML-specific name provider, scope computation,
 * and validation infrastructure.  It is used by both the standalone parser
 * and the language server (which adds LSP-specific providers on top).
 */

import type {
  LangiumCoreServices,
  LangiumSharedCoreServices,
  Module,
  PartialLangiumCoreServices,
} from 'langium';
import { SysMLNameProvider } from './name-provider.js';
import { SysMLScopeComputation } from './scope-computation.js';

/* ------------------------------------------------------------------ */
/*  Service interfaces                                                 */
/* ------------------------------------------------------------------ */

/**
 * Additional services that the SysML module provides on top of Langium core.
 */
export type SysMLAddedServices = {
  // Intentionally empty — extension point for downstream packages
};

export type SysMLServices = LangiumCoreServices & SysMLAddedServices;

/* ------------------------------------------------------------------ */
/*  Module                                                             */
/* ------------------------------------------------------------------ */

/**
 * Langium DI module for SysML-specific services.
 *
 * Consumers merge this with the default Langium module:
 * ```ts
 * const sysml = inject(createDefaultCoreModule({ shared }), SysMLGeneratedModule, SysMLModule);
 * ```
 */
export function createSysMLModule(): Module<SysMLServices, PartialLangiumCoreServices> {
  return {
    references: {
      NameProvider: () => new SysMLNameProvider(),
      ScopeComputation: (services: LangiumCoreServices) =>
        new SysMLScopeComputation(services),
    },
  };
}

/**
 * Shared module — register workspace-level services.
 * Currently empty; the language server adds its own shared overrides.
 */
export function createSysMLSharedModule(): Module<LangiumSharedCoreServices, object> {
  return {};
}
