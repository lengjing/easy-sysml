// ---------------------------------------------------------------------------
// Naming validation rules
// ---------------------------------------------------------------------------

import type { ASTNode } from '@easy-sysml/ast';
import { DiagnosticSeverity } from '@easy-sysml/protocol';
import type { Diagnostic } from '@easy-sysml/protocol';
import { SysMLElementKind } from '@easy-sysml/protocol';

import type { ValidationRule, ValidationContext } from '../validation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFINITION_KINDS = new Set<SysMLElementKind>([
  SysMLElementKind.PartDefinition,
  SysMLElementKind.AttributeDefinition,
  SysMLElementKind.ActionDefinition,
  SysMLElementKind.StateDefinition,
  SysMLElementKind.RequirementDefinition,
  SysMLElementKind.PortDefinition,
  SysMLElementKind.ConnectionDefinition,
  SysMLElementKind.InterfaceDefinition,
  SysMLElementKind.ItemDefinition,
  SysMLElementKind.FlowConnectionDefinition,
  SysMLElementKind.Package,
]);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** No two sibling elements in the same scope may share a name. */
export const duplicateNameRule: ValidationRule = {
  id: 'naming/duplicate-name',
  name: 'Duplicate Name',
  description: 'No duplicate names in the same scope',
  severity: DiagnosticSeverity.Error,
  validate(node: ASTNode, _context: ValidationContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const seen = new Map<string, ASTNode>();

    for (const child of node.children) {
      if (!child.name) {
        continue;
      }
      const existing = seen.get(child.name);
      if (existing) {
        diagnostics.push({
          range: child.range,
          message: `Duplicate name '${child.name}' in scope '${node.name ?? '<root>'}'`,
          severity: DiagnosticSeverity.Error,
          code: 'naming/duplicate-name',
          source: 'easy-sysml',
        });
      } else {
        seen.set(child.name, child);
      }
    }

    return diagnostics;
  },
};

/** Definitions and packages must have a name. */
export const emptyNameRule: ValidationRule = {
  id: 'naming/empty-name',
  name: 'Empty Name',
  description: 'Definitions must have names',
  severity: DiagnosticSeverity.Error,
  validate(node: ASTNode, _context: ValidationContext): Diagnostic[] {
    if (DEFINITION_KINDS.has(node.kind) && !node.name) {
      return [
        {
          range: node.range,
          message: `${node.kind} element must have a name`,
          severity: DiagnosticSeverity.Error,
          code: 'naming/empty-name',
          source: 'easy-sysml',
        },
      ];
    }
    return [];
  },
};
