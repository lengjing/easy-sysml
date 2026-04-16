import type { AstNode, PackageNode } from '@easy-sysml/ast';
import { walkAst } from '@easy-sysml/ast';
import type { SemanticAnalysisResult } from '@easy-sysml/semantic';
import { ValidationRegistry } from './registry.js';
import type { ValidationDiagnostic, ValidationContext } from './rule.js';

/** Result of validation */
export interface ValidationResult {
  diagnostics: ValidationDiagnostic[];
  rulesApplied: number;
  durationMs: number;
  hasErrors: boolean;
  hasWarnings: boolean;
}

/** Validation engine that runs rules against an AST */
export class ValidationEngine {
  private registry: ValidationRegistry;

  constructor(registry?: ValidationRegistry) {
    this.registry = registry ?? new ValidationRegistry();
  }

  /** Get the registry for configuration */
  getRegistry(): ValidationRegistry {
    return this.registry;
  }

  /** Validate an AST with semantic information */
  validate(ast: PackageNode, semantics: SemanticAnalysisResult): ValidationResult {
    const start = Date.now();
    const diagnostics: ValidationDiagnostic[] = [];
    let rulesApplied = 0;

    const context: ValidationContext = {
      ast,
      semantics,
      report: (diagnostic) => diagnostics.push(diagnostic),
    };

    // Walk the AST and apply matching rules to each node
    walkAst(ast, (node) => {
      const rules = this.registry.getRulesForType(node.$type);
      for (const rule of rules) {
        rule.validate(node, context);
        rulesApplied++;
      }
    });

    const durationMs = Date.now() - start;

    return {
      diagnostics,
      rulesApplied,
      durationMs,
      hasErrors: diagnostics.some(d => d.severity === 1),
      hasWarnings: diagnostics.some(d => d.severity === 2),
    };
  }
}
