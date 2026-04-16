import type { AstNode } from '@easy-sysml/ast';
import { type Symbol, SymbolTable } from './symbol-table.js';
export interface ImportDirective {
    namespacePath: string;
    isAll: boolean;
    isRecursive: boolean;
    visibility: 'public' | 'private' | 'protected';
}
/** A scope represents a naming context */
export declare class Scope {
    readonly name: string;
    readonly parent?: Scope;
    private children;
    private localSymbols;
    private imports;
    constructor(name: string, parent?: Scope);
    /** Define a symbol in this scope */
    define(symbol: Symbol): void;
    /** Resolve a name in this scope (including parent scopes) */
    resolve(name: string): Symbol | undefined;
    /** Resolve a qualified name (e.g., 'Package::SubPackage::Element') */
    resolveQualified(qualifiedName: string): Symbol | undefined;
    /** Get all visible symbols in this scope */
    getVisibleSymbols(): Symbol[];
    /** Create a child scope */
    createChild(name: string): Scope;
    /** Get a child scope by name */
    getChild(name: string): Scope | undefined;
    /** Add an import directive */
    addImport(importDirective: ImportDirective): void;
    /** Get the qualified name of this scope */
    getQualifiedName(): string;
    private resolveImport;
    private getImportedSymbols;
    private getRoot;
    private findScopeForSymbol;
}
/** Build scopes from an AST */
export declare class ScopeBuilder {
    private symbolTable;
    constructor(symbolTable: SymbolTable);
    /** Build the scope tree from an AST root */
    buildScopes(root: AstNode): Scope;
    private buildScopeForNode;
    private processChildren;
    private processImports;
}
//# sourceMappingURL=scope.d.ts.map