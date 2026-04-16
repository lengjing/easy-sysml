// ---------------------------------------------------------------------------
// Reference resolution for SysML v2
// ---------------------------------------------------------------------------

import type { ASTNode, UsageNode, DefinitionNode, ImportNode } from '@easy-sysml/ast';
import { walk } from '@easy-sysml/ast';
import { SysMLElementKind } from '@easy-sysml/protocol';

import type { Symbol } from './symbol.js';
import type { Scope } from './scope.js';
import { ScopeProvider } from './scope.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The kind of relationship a reference represents. */
export type ReferenceKind =
  | 'typing'
  | 'specialization'
  | 'subsetting'
  | 'redefinition'
  | 'import'
  | 'general';

/** An unresolved or resolved reference from one AST node to another. */
export interface Reference {
  readonly source: ASTNode;
  readonly targetName: string;
  resolvedTarget?: Symbol;
  readonly kind: ReferenceKind;
}

/** A reference that has been successfully resolved. */
export interface ResolvedReference extends Reference {
  readonly resolvedTarget: Symbol;
}

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

function isUsageNode(node: ASTNode): node is UsageNode {
  return USAGE_KINDS.has(node.kind);
}

function isDefinitionNode(node: ASTNode): node is DefinitionNode {
  return DEFINITION_KINDS.has(node.kind);
}

function isImportNode(node: ASTNode): node is ImportNode {
  return node.kind === SysMLElementKind.Import;
}

// ---------------------------------------------------------------------------
// ReferenceLinker
// ---------------------------------------------------------------------------

/** Collects and resolves cross-references within a SysML model. */
export class ReferenceLinker {
  private readonly unresolved: Reference[] = [];

  /** Walk the AST and collect all outbound references. */
  collectReferences(ast: ASTNode): Reference[] {
    const refs: Reference[] = [];

    walk(ast, {
      visitNode: (node: ASTNode) => {
        if (isUsageNode(node)) {
          for (const typing of node.typings) {
            refs.push({ source: node, targetName: typing, kind: 'typing' });
          }
          for (const sub of node.subsettings) {
            refs.push({ source: node, targetName: sub, kind: 'subsetting' });
          }
          for (const redef of node.redefinitions) {
            refs.push({ source: node, targetName: redef, kind: 'redefinition' });
          }
        }

        if (isDefinitionNode(node)) {
          for (const spec of node.specializations) {
            refs.push({ source: node, targetName: spec, kind: 'specialization' });
          }
        }

        if (isImportNode(node)) {
          refs.push({
            source: node,
            targetName: node.importedNamespace,
            kind: 'import',
          });
        }
      },
    });

    return refs;
  }

  /**
   * Attempt to resolve each reference against the given scope.
   * Returns only the successfully resolved references.
   */
  resolveReferences(references: Reference[], scope: Scope): ResolvedReference[] {
    const provider = new ScopeProvider();
    const resolved: ResolvedReference[] = [];
    this.unresolved.length = 0;

    for (const ref of references) {
      const sym = ref.targetName.includes('::')
        ? provider.resolveQualified(ref.targetName, scope)
        : provider.resolve(ref.targetName, scope);

      if (sym) {
        (ref as { resolvedTarget?: Symbol }).resolvedTarget = sym;
        resolved.push(ref as ResolvedReference);
      } else {
        this.unresolved.push(ref);
      }
    }

    return resolved;
  }

  /** Return references that could not be resolved in the last pass. */
  getUnresolvedReferences(): Reference[] {
    return [...this.unresolved];
  }
}
