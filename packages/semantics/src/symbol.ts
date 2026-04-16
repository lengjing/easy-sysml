// ---------------------------------------------------------------------------
// Symbol table for SysML v2 semantic analysis
// ---------------------------------------------------------------------------

import type { SysMLElementKind, VisibilityKind } from '@easy-sysml/protocol';
import type { ASTNode } from '@easy-sysml/ast';

import type { Scope } from './scope.js';

// ---------------------------------------------------------------------------
// Symbol
// ---------------------------------------------------------------------------

/** A resolved symbol in the SysML semantic model. */
export interface Symbol {
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: SysMLElementKind;
  readonly node: ASTNode;
  readonly scope: Scope;
  readonly visibility: VisibilityKind;
  readonly documentation?: string;
}

// ---------------------------------------------------------------------------
// SymbolTable
// ---------------------------------------------------------------------------

/** Central registry of all symbols discovered during semantic analysis. */
export class SymbolTable {
  private readonly byName = new Map<string, Symbol>();
  private readonly byQualifiedName = new Map<string, Symbol>();

  /** Add a symbol to the table. */
  addSymbol(symbol: Symbol): void {
    this.byName.set(symbol.name, symbol);
    this.byQualifiedName.set(symbol.qualifiedName, symbol);
  }

  /** Look up a symbol by its simple (unqualified) name. */
  getSymbol(name: string): Symbol | undefined {
    return this.byName.get(name);
  }

  /** Look up a symbol by its fully qualified name (e.g. `Pkg::Def`). */
  getSymbolByQualifiedName(qn: string): Symbol | undefined {
    return this.byQualifiedName.get(qn);
  }

  /** Return every symbol in the table. */
  getAllSymbols(): Symbol[] {
    return [...this.byQualifiedName.values()];
  }

  /** Return all symbols whose element kind matches `kind`. */
  getSymbolsByKind(kind: SysMLElementKind): Symbol[] {
    return this.getAllSymbols().filter((s) => s.kind === kind);
  }

  /** Remove a symbol by its simple name. Returns `true` if found. */
  removeSymbol(name: string): boolean {
    const sym = this.byName.get(name);
    if (!sym) {
      return false;
    }
    this.byName.delete(name);
    this.byQualifiedName.delete(sym.qualifiedName);
    return true;
  }

  /** Remove all symbols. */
  clear(): void {
    this.byName.clear();
    this.byQualifiedName.clear();
  }
}
