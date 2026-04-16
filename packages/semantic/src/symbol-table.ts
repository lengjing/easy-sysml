import type { AstNode } from '@easy-sysml/ast';
import type { Scope } from './scope.js';

/** Symbol representing a named element in the model */
export interface Symbol {
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  node: AstNode;
  scope: Scope;
  type?: Symbol;
  definition?: Symbol;
}

export enum SymbolKind {
  PACKAGE = 'package',
  DEFINITION = 'definition',
  USAGE = 'usage',
  FEATURE = 'feature',
  RELATIONSHIP = 'relationship',
  IMPORT = 'import',
  NAMESPACE = 'namespace',
}

/** Symbol table storing all symbols indexed by name and qualified name */
export class SymbolTable {
  private symbols = new Map<string, Symbol[]>();
  private byQualifiedName = new Map<string, Symbol>();
  private byNode = new Map<AstNode, Symbol>();

  /** Add a symbol to the table */
  addSymbol(symbol: Symbol): void {
    const existing = this.symbols.get(symbol.name);
    if (existing) {
      existing.push(symbol);
    } else {
      this.symbols.set(symbol.name, [symbol]);
    }
    this.byQualifiedName.set(symbol.qualifiedName, symbol);
    this.byNode.set(symbol.node, symbol);
  }

  /** Get symbols by simple name */
  getByName(name: string): Symbol[] {
    return this.symbols.get(name) ?? [];
  }

  /** Get a symbol by its qualified name */
  getByQualifiedName(qualifiedName: string): Symbol | undefined {
    return this.byQualifiedName.get(qualifiedName);
  }

  /** Get the symbol for an AST node */
  getForNode(node: AstNode): Symbol | undefined {
    return this.byNode.get(node);
  }

  /** Get all symbols */
  getAllSymbols(): Symbol[] {
    const result: Symbol[] = [];
    for (const syms of this.symbols.values()) {
      result.push(...syms);
    }
    return result;
  }

  /** Remove symbol */
  removeSymbol(symbol: Symbol): void {
    const byName = this.symbols.get(symbol.name);
    if (byName) {
      const idx = byName.indexOf(symbol);
      if (idx !== -1) {
        byName.splice(idx, 1);
      }
      if (byName.length === 0) {
        this.symbols.delete(symbol.name);
      }
    }
    this.byQualifiedName.delete(symbol.qualifiedName);
    this.byNode.delete(symbol.node);
  }

  /** Clear all symbols */
  clear(): void {
    this.symbols.clear();
    this.byQualifiedName.clear();
    this.byNode.clear();
  }
}
