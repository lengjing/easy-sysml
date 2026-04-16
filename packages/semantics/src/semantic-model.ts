// ---------------------------------------------------------------------------
// High-level semantic model builder
// ---------------------------------------------------------------------------

import type { ASTNode } from '@easy-sysml/ast';
import type { Diagnostic } from '@easy-sysml/protocol';

import { SymbolTable } from './symbol.js';
import type { Symbol } from './symbol.js';
import type { Scope } from './scope.js';
import { ScopeProvider } from './scope.js';
import { TypeRegistry, TypeChecker } from './type-system.js';
import { ReferenceLinker } from './reference-linker.js';
import type { Reference } from './reference-linker.js';
import { ValidationEngine } from './validation.js';
import type { ValidationContext } from './validation.js';

import {
  duplicateNameRule,
  emptyNameRule,
  unresolvedTypeRule,
  invalidSpecializationRule,
  nestedPackageRule,
  orphanUsageRule,
  importTargetRule,
} from './rules/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of building the full semantic model. */
export interface SemanticModelResult {
  readonly symbolTable: SymbolTable;
  readonly rootScope: Scope;
  readonly diagnostics: Diagnostic[];
  readonly references: Reference[];
}

// ---------------------------------------------------------------------------
// SemanticModel
// ---------------------------------------------------------------------------

/**
 * Orchestrates scope building, symbol resolution, type checking,
 * reference linking, and validation for a SysML AST.
 */
export class SemanticModel {
  private symbolTable = new SymbolTable();
  private rootScope: Scope | undefined;
  private readonly typeRegistry = new TypeRegistry();
  private diagnostics: Diagnostic[] = [];
  private references: Reference[] = [];
  private readonly validationEngine = new ValidationEngine();

  constructor() {
    this.typeRegistry.registerPrimitiveTypes();

    // Register all built-in rules
    this.validationEngine.addRule(duplicateNameRule);
    this.validationEngine.addRule(emptyNameRule);
    this.validationEngine.addRule(unresolvedTypeRule);
    this.validationEngine.addRule(invalidSpecializationRule);
    this.validationEngine.addRule(nestedPackageRule);
    this.validationEngine.addRule(orphanUsageRule);
    this.validationEngine.addRule(importTargetRule);
  }

  /** Build the complete semantic model from an AST root. */
  build(ast: ASTNode): SemanticModelResult {
    this.symbolTable = new SymbolTable();
    this.diagnostics = [];
    this.references = [];

    // 1. Build scope tree
    const scopeProvider = new ScopeProvider();
    this.rootScope = scopeProvider.buildScopes(ast);

    // 2. Populate symbol table from scopes
    this.populateSymbolTable(this.rootScope);

    // 3. Collect and resolve references
    const linker = new ReferenceLinker();
    const refs = linker.collectReferences(ast);
    linker.resolveReferences(refs, this.rootScope);
    this.references = refs;

    // 4. Run validation
    const context: ValidationContext = {
      scope: this.rootScope,
      symbolTable: this.symbolTable,
      typeRegistry: this.typeRegistry,
    };
    this.diagnostics = this.validationEngine.validate(ast, context);

    return {
      symbolTable: this.symbolTable,
      rootScope: this.rootScope,
      diagnostics: this.diagnostics,
      references: this.references,
    };
  }

  /** Get the current symbol table. */
  getSymbolTable(): SymbolTable {
    return this.symbolTable;
  }

  /** Get the root scope (available after `build`). */
  getScope(): Scope | undefined {
    return this.rootScope;
  }

  /** Get the type registry. */
  getTypeRegistry(): TypeRegistry {
    return this.typeRegistry;
  }

  /** Get diagnostics produced during the last `build`. */
  getDiagnostics(): Diagnostic[] {
    return this.diagnostics;
  }

  /** Get all references collected during the last `build`. */
  getReferences(): Reference[] {
    return this.references;
  }

  /** Access the validation engine to add/remove custom rules. */
  getValidationEngine(): ValidationEngine {
    return this.validationEngine;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private populateSymbolTable(scope: Scope): void {
    for (const sym of scope.symbols.values()) {
      this.symbolTable.addSymbol(sym);
    }
    for (const child of scope.children) {
      this.populateSymbolTable(child);
    }
  }
}
