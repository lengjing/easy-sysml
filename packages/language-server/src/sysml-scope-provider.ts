/**
 * SysML Scope Provider
 *
 * Custom scope provider that handles the mismatch between the Langium
 * grammar type hierarchy and SysML v2 semantic type hierarchy.
 *
 * The SysML grammar generates AST types like PartDefinition, ActionUsage, etc.
 * These are NOT subtypes of the grammar-level "Type" or "Feature" rules in
 * Langium's `isSubtype` check.  The `DefaultScopeProvider` filters scope entries
 * by reference type via `isSubtype(desc.type, referenceType)`, which incorrectly
 * removes valid matches (e.g. PartDefinition when looking for a Type reference).
 *
 * This provider skips the type filter for local scopes and returns all indexed
 * elements for the global scope, letting the linker match by name only.
 */

import {
  DefaultScopeProvider,
  MultiMapScope,
  type AstNodeDescription,
  type LangiumCoreServices,
  type ReferenceInfo,
  type Scope,
  type Stream,
} from 'langium';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class SysMLScopeProvider extends DefaultScopeProvider {
  constructor(services: LangiumCoreServices) {
    super(services);
  }

  override getScope(context: ReferenceInfo): Scope {
    const scopes: Stream<AstNodeDescription>[] = [];
    const doc = (context.container as any).$document ?? findDocument(context.container);
    const localSymbols = doc?.localSymbols;

    if (localSymbols) {
      let currentNode: any = context.container;
      do {
        if (localSymbols.has(currentNode)) {
          // Do NOT filter by reference type — the grammar type hierarchy
          // doesn't reflect SysML's semantic subtyping.
          scopes.push(localSymbols.getStream(currentNode));
        }
        currentNode = currentNode.$container;
      } while (currentNode);
    }

    let result = this.getSysMLGlobalScope(context);
    for (let i = scopes.length - 1; i >= 0; i--) {
      result = this.createScope(scopes[i], result);
    }
    return result;
  }

  /**
   * Return all exported elements regardless of grammar-level type.
   */
  private getSysMLGlobalScope(_context: ReferenceInfo): Scope {
    return this.globalScopeCache.get('__sysml__', () =>
      new MultiMapScope(this.indexManager.allElements()),
    );
  }
}

/** Walk up to find the document root */
function findDocument(node: any): any {
  let current = node;
  while (current?.$container) {
    current = current.$container;
  }
  return current?.$document;
}

export function createSysMLScopeProvider(services: LangiumCoreServices): SysMLScopeProvider {
  return new SysMLScopeProvider(services);
}
