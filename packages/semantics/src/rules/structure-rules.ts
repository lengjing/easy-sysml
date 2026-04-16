// ---------------------------------------------------------------------------
// Structural validation rules
// ---------------------------------------------------------------------------

import type { ASTNode, PackageNode, UsageNode, ImportNode } from '@easy-sysml/ast';
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

const ALLOWED_IN_PACKAGE = new Set<SysMLElementKind>([
  SysMLElementKind.Package,
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
  SysMLElementKind.Import,
  SysMLElementKind.Comment,
  SysMLElementKind.Documentation,
  SysMLElementKind.Alias,
  SysMLElementKind.Namespace,
  SysMLElementKind.Enumeration,
]);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Packages may only contain allowed member kinds. */
export const nestedPackageRule: ValidationRule = {
  id: 'structure/nested-package',
  name: 'Nested Package Contents',
  description: 'Packages can contain definitions and usages',
  severity: DiagnosticSeverity.Warning,
  validate(node: ASTNode, _context: ValidationContext): Diagnostic[] {
    if (node.kind !== SysMLElementKind.Package) {
      return [];
    }

    const diagnostics: Diagnostic[] = [];
    for (const child of node.children) {
      if (!ALLOWED_IN_PACKAGE.has(child.kind)) {
        diagnostics.push({
          range: child.range,
          message: `Element of kind '${child.kind}' is not expected inside a package`,
          severity: DiagnosticSeverity.Warning,
          code: 'structure/nested-package',
          source: 'easy-sysml',
        });
      }
    }

    return diagnostics;
  },
};

/** Usage elements should declare at least one typing. */
export const orphanUsageRule: ValidationRule = {
  id: 'structure/orphan-usage',
  name: 'Orphan Usage',
  description: 'Usage elements should have types',
  severity: DiagnosticSeverity.Warning,
  validate(node: ASTNode, _context: ValidationContext): Diagnostic[] {
    if (!USAGE_KINDS.has(node.kind)) {
      return [];
    }

    const usage = node as UsageNode;
    if (usage.typings.length === 0) {
      return [
        {
          range: node.range,
          message: `Usage '${node.name ?? '<anonymous>'}' has no type`,
          severity: DiagnosticSeverity.Warning,
          code: 'structure/orphan-usage',
          source: 'easy-sysml',
        },
      ];
    }

    return [];
  },
};

/** Import targets must resolve to existing symbols. */
export const importTargetRule: ValidationRule = {
  id: 'structure/import-target',
  name: 'Import Target',
  description: 'Import targets must exist',
  severity: DiagnosticSeverity.Error,
  validate(node: ASTNode, context: ValidationContext): Diagnostic[] {
    if (node.kind !== SysMLElementKind.Import) {
      return [];
    }

    const importNode = node as ImportNode;
    const target = importNode.importedNamespace;

    const sym = context.symbolTable.getSymbol(target)
      ?? context.symbolTable.getSymbolByQualifiedName(target);

    if (!sym) {
      return [
        {
          range: node.range,
          message: `Import target '${target}' could not be resolved`,
          severity: DiagnosticSeverity.Error,
          code: 'structure/import-target',
          source: 'easy-sysml',
        },
      ];
    }

    return [];
  },
};
