import type { AstNode } from '@easy-sysml/ast';
import type { EdgeType } from '@easy-sysml/protocol';
import type { Scope } from './scope.js';
import type { Symbol, SymbolTable } from './symbol-table.js';
/** A resolved reference from one element to another */
export interface ResolvedReference {
    source: AstNode;
    target: Symbol;
    kind: EdgeType;
    referenceName: string;
}
/** Unresolved reference (for error reporting) */
export interface UnresolvedReference {
    source: AstNode;
    referenceName: string;
    kind: EdgeType;
    message: string;
    line: number;
    column: number;
}
/** Reference resolver - links cross-references in the AST */
export declare class ReferenceResolver {
    private symbolTable;
    private rootScope;
    private resolved;
    private unresolved;
    constructor(symbolTable: SymbolTable, rootScope: Scope);
    /** Resolve all references in the AST */
    resolveAll(root: AstNode): void;
    /** Get resolved references */
    getResolved(): ResolvedReference[];
    /** Get unresolved references (for diagnostics) */
    getUnresolved(): UnresolvedReference[];
    /** Find all references to a symbol */
    findReferences(symbol: Symbol): ResolvedReference[];
    private resolveNode;
    private resolveTyping;
    private resolveSpecialization;
    private resolveImport;
}
//# sourceMappingURL=reference-resolver.d.ts.map