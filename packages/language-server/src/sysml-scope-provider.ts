/**
 * SysML Scope Provider
 *
 * Delegates scope resolution to the default Langium scope provider
 * with SysML-specific scope computation.
 */

import { DefaultScopeProvider, type LangiumCoreServices, type ScopeProvider } from 'langium';

export function createSysMLScopeProvider(services: LangiumCoreServices): ScopeProvider {
  return new DefaultScopeProvider(services);
}
