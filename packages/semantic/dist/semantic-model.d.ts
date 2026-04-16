import type { AstNode, PackageNode } from '@easy-sysml/ast';
import { SymbolTable } from './symbol-table.js';
import { Scope } from './scope.js';
import { TypeSystem } from './type-system.js';
import { type ResolvedReference, type UnresolvedReference } from './reference-resolver.js';
/** Result of semantic analysis */
export interface SemanticAnalysisResult {
    symbolTable: SymbolTable;
    rootScope: Scope;
    typeSystem: TypeSystem;
    resolvedReferences: ResolvedReference[];
    unresolvedReferences: UnresolvedReference[];
    errors: SemanticError[];
}
export interface SemanticError {
    message: string;
    node?: AstNode;
    line?: number;
    column?: number;
    severity: 'error' | 'warning' | 'info';
}
/** Perform semantic analysis on a parsed AST */
export declare class SemanticAnalyzer {
    private symbolTable;
    private typeSystem;
    /** Analyze an AST root */
    analyze(root: PackageNode): SemanticAnalysisResult;
}
//# sourceMappingURL=semantic-model.d.ts.map