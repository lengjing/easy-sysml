import { DiagnosticSeverity } from '@easy-sysml/protocol';
import type { ValidationRule, ValidationContext } from '../rule.js';
import type { AstNode } from '@easy-sysml/ast';

/** Rule: Definitions should have at least one feature */
export const emptyDefinitionRule: ValidationRule = {
  id: 'sysml.structure.empty-definition',
  description: 'Definitions should have at least one member',
  severity: DiagnosticSeverity.INFORMATION,
  appliesTo: ['PartDefinition', 'PortDefinition', 'ActionDefinition', 'StateDefinition'],
  validate(node: AstNode, context: ValidationContext): void {
    const members = (node as any).members;
    if (Array.isArray(members) && members.length === 0) {
      context.report({
        code: this.id,
        message: `Definition '${(node as any).name || '<unnamed>'}' has no members`,
        severity: this.severity,
        node,
        source: 'sysml-validation',
      });
    }
  },
};

/** Rule: Usages should have a type */
export const untypedUsageRule: ValidationRule = {
  id: 'sysml.structure.untyped-usage',
  description: 'Usage elements should have a type',
  severity: DiagnosticSeverity.WARNING,
  appliesTo: ['PartUsage', 'AttributeUsage', 'PortUsage'],
  validate(node: AstNode, context: ValidationContext): void {
    const typings = (node as any).typings;
    if (Array.isArray(typings) && typings.length === 0) {
      const name = (node as any).name;
      context.report({
        code: this.id,
        message: `Usage '${name || '<unnamed>'}' has no type specified`,
        severity: this.severity,
        node,
        source: 'sysml-validation',
      });
    }
  },
};

/** Rule: No duplicate names in the same scope */
export const duplicateNameRule: ValidationRule = {
  id: 'sysml.structure.duplicate-name',
  description: 'Elements in the same scope should have unique names',
  severity: DiagnosticSeverity.ERROR,
  appliesTo: [],  // applies to all
  validate(node: AstNode, context: ValidationContext): void {
    const members = (node as any).members;
    if (!Array.isArray(members)) return;

    const names = new Map<string, AstNode>();
    for (const member of members) {
      const memberElement = (member as any).memberElement ?? member;
      const name = (memberElement as any).name;
      if (typeof name === 'string' && name.length > 0) {
        if (names.has(name)) {
          context.report({
            code: this.id,
            message: `Duplicate name '${name}' in scope`,
            severity: this.severity,
            node: memberElement,
            source: 'sysml-validation',
          });
        } else {
          names.set(name, memberElement);
        }
      }
    }
  },
};
