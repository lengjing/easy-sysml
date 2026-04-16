import { SymbolTable } from './symbol-table.js';
import { ScopeBuilder } from './scope.js';
import { TypeSystem } from './type-system.js';
import { ReferenceResolver } from './reference-resolver.js';
/** Perform semantic analysis on a parsed AST */
export class SemanticAnalyzer {
    symbolTable = new SymbolTable();
    typeSystem = new TypeSystem();
    /** Analyze an AST root */
    analyze(root) {
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
        const errors = resolver.getUnresolved().map((u) => ({
            message: u.message,
            line: u.line,
            column: u.column,
            severity: 'error',
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
//# sourceMappingURL=semantic-model.js.map