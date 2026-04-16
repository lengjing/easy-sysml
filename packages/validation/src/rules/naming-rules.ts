import { DiagnosticSeverity } from '@easy-sysml/protocol';
import type { ValidationRule, ValidationContext } from '../rule.js';
import type { AstNode } from '@easy-sysml/ast';

/** Rule: Definition names should start with uppercase */
export const definitionNamingRule: ValidationRule = {
  id: 'sysml.naming.definition-uppercase',
  description: 'Definition names should start with an uppercase letter',
  severity: DiagnosticSeverity.WARNING,
  appliesTo: ['PartDefinition', 'AttributeDefinition', 'PortDefinition', 'ActionDefinition', 'StateDefinition', 'RequirementDefinition', 'ConstraintDefinition'],
  validate(node: AstNode, context: ValidationContext): void {
    const name = (node as any).name;
    if (typeof name === 'string' && name.length > 0 && name[0] !== name[0].toUpperCase()) {
      context.report({
        code: this.id,
        message: `Definition name '${name}' should start with an uppercase letter`,
        severity: this.severity,
        node,
        source: 'sysml-validation',
      });
    }
  },
};

/** Rule: Usage names should start with lowercase */
export const usageNamingRule: ValidationRule = {
  id: 'sysml.naming.usage-lowercase',
  description: 'Usage names should start with a lowercase letter',
  severity: DiagnosticSeverity.WARNING,
  appliesTo: ['PartUsage', 'AttributeUsage', 'PortUsage', 'ActionUsage', 'StateUsage'],
  validate(node: AstNode, context: ValidationContext): void {
    const name = (node as any).name;
    if (typeof name === 'string' && name.length > 0 && name[0] !== name[0].toLowerCase()) {
      context.report({
        code: this.id,
        message: `Usage name '${name}' should start with a lowercase letter`,
        severity: this.severity,
        node,
        source: 'sysml-validation',
      });
    }
  },
};

/** Rule: Package names should not be empty */
export const packageNameRule: ValidationRule = {
  id: 'sysml.naming.package-nonempty',
  description: 'Package names must not be empty',
  severity: DiagnosticSeverity.ERROR,
  appliesTo: ['Package'],
  validate(node: AstNode, context: ValidationContext): void {
    const name = (node as any).name;
    if (name === undefined || name === '') {
      context.report({
        code: this.id,
        message: 'Package must have a name',
        severity: this.severity,
        node,
        source: 'sysml-validation',
      });
    }
  },
};
