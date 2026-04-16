// ---------------------------------------------------------------------------
// Typing validation rules
// ---------------------------------------------------------------------------

import type { ASTNode, UsageNode, DefinitionNode } from '@easy-sysml/ast';
import { DiagnosticSeverity, SysMLElementKind } from '@easy-sysml/protocol';
import type { Diagnostic } from '@easy-sysml/protocol';

import type { ValidationRule, ValidationContext } from '../validation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USAGE_KINDS = new Set<SysMLElementKind>([
  SysMLElementKind.PartUsage,
  SysMLElementKind.AttributeUsage,
  SysMLElementKind.ActionUsage,
  SysMLElementKind.StateUsage,
  SysMLElementKind.RequirementUsage,
  SysMLElementKind.PortUsage,
  SysMLElementKind.ConnectionUsage,
  SysMLElementKind.InterfaceUsage,
  SysMLElementKind.ItemUsage,
  SysMLElementKind.FlowConnectionUsage,
]);

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
]);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Type references on usage elements must resolve to known symbols. */
export const unresolvedTypeRule: ValidationRule = {
  id: 'typing/unresolved-type',
  name: 'Unresolved Type',
  description: 'Type references must resolve to known symbols',
  severity: DiagnosticSeverity.Error,
  validate(node: ASTNode, context: ValidationContext): Diagnostic[] {
    if (!USAGE_KINDS.has(node.kind)) {
      return [];
    }

    const usage = node as UsageNode;
    const diagnostics: Diagnostic[] = [];

    for (const typing of usage.typings) {
      const sym = context.symbolTable.getSymbol(typing)
        ?? context.symbolTable.getSymbolByQualifiedName(typing);
      if (!sym) {
        diagnostics.push({
          range: node.range,
          message: `Unresolved type reference '${typing}'`,
          severity: DiagnosticSeverity.Error,
          code: 'typing/unresolved-type',
          source: 'easy-sysml',
        });
      }
    }

    return diagnostics;
  },
};

/** Specialization targets must be definition elements. */
export const invalidSpecializationRule: ValidationRule = {
  id: 'typing/invalid-specialization',
  name: 'Invalid Specialization',
  description: 'Specialization targets must be definition elements',
  severity: DiagnosticSeverity.Error,
  validate(node: ASTNode, context: ValidationContext): Diagnostic[] {
    if (!DEFINITION_KINDS.has(node.kind)) {
      return [];
    }

    const def = node as DefinitionNode;
    const diagnostics: Diagnostic[] = [];

    for (const spec of def.specializations) {
      const sym = context.symbolTable.getSymbol(spec)
        ?? context.symbolTable.getSymbolByQualifiedName(spec);
      if (sym && !DEFINITION_KINDS.has(sym.kind)) {
        diagnostics.push({
          range: node.range,
          message: `Specialization target '${spec}' is not a definition (found ${sym.kind})`,
          severity: DiagnosticSeverity.Error,
          code: 'typing/invalid-specialization',
          source: 'easy-sysml',
        });
      }
    }

    return diagnostics;
  },
};
