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
export declare enum SymbolKind {
    PACKAGE = "package",
    DEFINITION = "definition",
    USAGE = "usage",
    FEATURE = "feature",
    RELATIONSHIP = "relationship",
    IMPORT = "import",
    NAMESPACE = "namespace"
}
/** Symbol table storing all symbols indexed by name and qualified name */
export declare class SymbolTable {
    private symbols;
    private byQualifiedName;
    private byNode;
    /** Add a symbol to the table */
    addSymbol(symbol: Symbol): void;
    /** Get symbols by simple name */
    getByName(name: string): Symbol[];
    /** Get a symbol by its qualified name */
    getByQualifiedName(qualifiedName: string): Symbol | undefined;
    /** Get the symbol for an AST node */
    getForNode(node: AstNode): Symbol | undefined;
    /** Get all symbols */
    getAllSymbols(): Symbol[];
    /** Remove symbol */
    removeSymbol(symbol: Symbol): void;
    /** Clear all symbols */
    clear(): void;
}
//# sourceMappingURL=symbol-table.d.ts.map