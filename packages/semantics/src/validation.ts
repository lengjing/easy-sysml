// ---------------------------------------------------------------------------
// Pluggable validation rule engine for SysML v2
// ---------------------------------------------------------------------------

import type { ASTNode } from '@easy-sysml/ast';
import { walk } from '@easy-sysml/ast';
import type { Diagnostic, DiagnosticSeverity } from '@easy-sysml/protocol';

import type { Scope } from './scope.js';
import type { SymbolTable } from './symbol.js';
import type { TypeRegistry } from './type-system.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context provided to each validation rule. */
export interface ValidationContext {
  readonly scope: Scope;
  readonly symbolTable: SymbolTable;
  readonly typeRegistry: TypeRegistry;
}

/** A single pluggable validation rule. */
export interface ValidationRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: DiagnosticSeverity;
  validate(node: ASTNode, context: ValidationContext): Diagnostic[];
}

// ---------------------------------------------------------------------------
// ValidationEngine
// ---------------------------------------------------------------------------

/** Runs a collection of pluggable rules against an AST. */
export class ValidationEngine {
  private readonly rules = new Map<string, ValidationRule>();

  /** Register a validation rule. */
  addRule(rule: ValidationRule): void {
    this.rules.set(rule.id, rule);
  }

  /** Remove a rule by its id. */
  removeRule(id: string): void {
    this.rules.delete(id);
  }

  /** Get all registered rules. */
  getRules(): ValidationRule[] {
    return [...this.rules.values()];
  }

  /** Validate the entire AST, returning all diagnostics. */
  validate(ast: ASTNode, context: ValidationContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    walk(ast, {
      visitNode: (node: ASTNode) => {
        diagnostics.push(...this.validateNode(node, context));
      },
    });
    return diagnostics;
  }

  /** Validate a single node against all registered rules. */
  validateNode(node: ASTNode, context: ValidationContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const rule of this.rules.values()) {
      diagnostics.push(...rule.validate(node, context));
    }
    return diagnostics;
  }
}
