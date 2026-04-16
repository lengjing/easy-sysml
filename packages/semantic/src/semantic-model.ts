import type { AstNode, PackageNode } from '@easy-sysml/ast';
import { SymbolTable, type Symbol } from './symbol-table.js';
import { Scope, ScopeBuilder } from './scope.js';
import { TypeSystem } from './type-system.js';
import { ReferenceResolver, type ResolvedReference, type UnresolvedReference } from './reference-resolver.js';

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
export class SemanticAnalyzer {
  private symbolTable = new SymbolTable();
  private typeSystem = new TypeSystem();

  /** Analyze an AST root */
  analyze(root: PackageNode): SemanticAnalysisResult {
    // 1. Register built-in types
    this.typeSystem.registerBuiltins();

    // 2. Build symbol table and scopes
    const scopeBuilder = new ScopeBuilder(this.symbolTable);
    const rootScope = scopeBuilder.buildScopes(root);

    // 3. Build type information
    this.typeSystem.buildFromSymbols(this.symbolTable);

    // 4. Resolve references
    const resolver = new ReferenceResolver(this.symbolTable, rootScope);
    resolver.resolveAll(root);

    // 5. Collect errors from unresolved references
    const errors: SemanticError[] = resolver.getUnresolved().map((u) => ({
      message: u.message,
      line: u.line,
      column: u.column,
      severity: 'error' as const,
    }));

    return {
      symbolTable: this.symbolTable,
      rootScope,
      typeSystem: this.typeSystem,
      resolvedReferences: resolver.getResolved(),
      unresolvedReferences: resolver.getUnresolved(),
      errors,
    };
  }
}
