import { DiagnosticSeverity } from '@easy-sysml/protocol';
import type { ValidationRule, ValidationContext } from '../rule.js';
import type { AstNode } from '@easy-sysml/ast';

/** Rule: All type references should resolve */
export const unresolvedTypeRule: ValidationRule = {
  id: 'sysml.reference.unresolved-type',
  description: 'Type references must resolve to a definition',
  severity: DiagnosticSeverity.ERROR,
  appliesTo: [],  // checked via semantic analysis
  validate(node: AstNode, context: ValidationContext): void {
    // This rule uses the semantic analysis results
    // Unresolved references are already reported by the reference resolver
    // This is a no-op placeholder that could be extended with additional checks
  },
};

/** Rule: Specialization targets must be compatible */
export const specializationCompatibilityRule: ValidationRule = {
  id: 'sysml.reference.specialization-compatibility',
  description: 'Specialization targets must be of compatible metatype',
  severity: DiagnosticSeverity.ERROR,
  appliesTo: ['PartDefinition', 'AttributeDefinition', 'PortDefinition', 'ActionDefinition'],
  validate(node: AstNode, context: ValidationContext): void {
    const specializations = (node as any).specializations;
    if (!Array.isArray(specializations)) return;

    for (const spec of specializations) {
      const generalName = (spec as any).general;
      if (typeof generalName !== 'string') continue;

      const resolved = context.semantics.rootScope.resolveQualified(generalName)
        ?? context.semantics.rootScope.resolve(generalName);

      if (resolved && resolved.node.$type !== node.$type) {
        context.report({
          code: this.id,
          message: `Cannot specialize '${generalName}': incompatible type (expected ${node.$type}, found ${resolved.node.$type})`,
          severity: this.severity,
          node,
          source: 'sysml-validation',
        });
      }
    }
  },
};
