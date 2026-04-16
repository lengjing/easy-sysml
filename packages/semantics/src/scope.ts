// ---------------------------------------------------------------------------
// Scope resolution for SysML v2
// ---------------------------------------------------------------------------

import { SysMLElementKind, VisibilityKind } from '@easy-sysml/protocol';
import type { ASTNode } from '@easy-sysml/ast';
import { walk } from '@easy-sysml/ast';

import type { Symbol } from './symbol.js';

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

/** A lexical scope that may contain symbols and child scopes. */
export interface Scope {
  readonly name: string;
  parent?: Scope;
  readonly symbols: Map<string, Symbol>;
  readonly children: Scope[];
}

// Kinds that introduce their own scope
const SCOPE_INTRODUCING_KINDS = new Set<SysMLElementKind>([
  SysMLElementKind.Package,
  SysMLElementKind.PartDefinition,
  SysMLElementKind.AttributeDefinition,
  SysMLElementKind.ActionDefinition,
  SysMLElementKind.StateDefinition,
  SysMLElementKind.RequirementDefinition,
  SysMLElementKind.PortDefinition,
  SysMLElementKind.ConnectionDefinition,
  SysMLElementKind.InterfaceDefinition,
  SysMLElementKind.ItemDefinition,
  SysMLElementKind.FlowConnectionDefinition,
  SysMLElementKind.Namespace,
]);

// ---------------------------------------------------------------------------
// ScopeProvider
// ---------------------------------------------------------------------------

/** Builds and queries the scope tree for a SysML model. */
export class ScopeProvider {
  /** Create a new empty scope with an optional parent. */
  createScope(name: string, parent?: Scope): Scope {
    const scope: Scope = {
      name,
      parent,
      symbols: new Map(),
      children: [],
    };
    if (parent) {
      parent.children.push(scope);
    }
    return scope;
  }

  /** Register a symbol in a scope. */
  addToScope(scope: Scope, symbol: Symbol): void {
    scope.symbols.set(symbol.name, symbol);
  }

  /**
   * Resolve a simple (unqualified) name starting from `fromScope`,
   * walking up the scope chain until a match is found.
   */
  resolve(name: string, fromScope: Scope): Symbol | undefined {
    let current: Scope | undefined = fromScope;
    while (current) {
      const sym = current.symbols.get(name);
      if (sym) {
        return sym;
      }
      current = current.parent;
    }
    return undefined;
  }

  /**
   * Resolve a qualified name (segments separated by `::`) starting
   * from the root scope and walking down.
   */
  resolveQualified(qualifiedName: string, rootScope: Scope): Symbol | undefined {
    const segments = qualifiedName.split('::');
    let currentScope: Scope = rootScope;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const sym = currentScope.symbols.get(seg);

      if (i === segments.length - 1) {
        return sym;
      }

      if (!sym) {
        return undefined;
      }

      // Find the child scope that matches this segment
      const childScope = currentScope.children.find((c) => c.name === seg);
      if (!childScope) {
        return undefined;
      }
      currentScope = childScope;
    }

    return undefined;
  }

  /** Collect all symbols visible from a scope (own + ancestors). */
  getVisibleSymbols(scope: Scope): Symbol[] {
    const seen = new Map<string, Symbol>();
    let current: Scope | undefined = scope;
    while (current) {
      for (const [name, sym] of current.symbols) {
        // Inner scopes shadow outer scopes
        if (!seen.has(name)) {
          seen.set(name, sym);
        }
      }
      current = current.parent;
    }
    return [...seen.values()];
  }

  /** Build a scope tree from an AST, returning the root scope. */
  buildScopes(ast: ASTNode): Scope {
    const rootScope = this.createScope('<root>');
    const scopeStack: Scope[] = [rootScope];

    walk(ast, {
      visitNode: (node: ASTNode) => {
        const parentScope = scopeStack[scopeStack.length - 1];

        if (node.name && SCOPE_INTRODUCING_KINDS.has(node.kind)) {
          const childScope = this.createScope(node.name, parentScope);
          const qn = this.buildQualifiedName(childScope);
          const sym: Symbol = {
            name: node.name,
            qualifiedName: qn,
            kind: node.kind,
            node,
            scope: parentScope,
            visibility: node.visibility ?? VisibilityKind.Public,
          };
          this.addToScope(parentScope, sym);
          scopeStack.push(childScope);
        } else if (node.name) {
          const qn = this.buildQualifiedName(parentScope) + '::' + node.name;
          const sym: Symbol = {
            name: node.name,
            qualifiedName: qn === '::' + node.name ? node.name : qn,
            kind: node.kind,
            node,
            scope: parentScope,
            visibility: node.visibility ?? VisibilityKind.Public,
          };
          this.addToScope(parentScope, sym);
        }
      },
    });

    return rootScope;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildQualifiedName(scope: Scope): string {
    const parts: string[] = [];
    let current: Scope | undefined = scope;
    while (current && current.name !== '<root>') {
      parts.unshift(current.name);
      current = current.parent;
    }
    return parts.join('::');
  }
}
