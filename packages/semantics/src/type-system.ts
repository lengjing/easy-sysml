// ---------------------------------------------------------------------------
// Type system for SysML v2
// ---------------------------------------------------------------------------

import type { ASTNode, DefinitionNode, UsageNode } from '@easy-sysml/ast';
import { SysMLElementKind } from '@easy-sysml/protocol';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Represents a SysML type in the type registry. */
export interface SysMLType {
  readonly name: string;
  readonly kind: 'definition' | 'usage' | 'feature' | 'primitive';
  readonly supertypes: SysMLType[];
  readonly features: SysMLType[];
}

/** Result of a type-checking operation. */
export interface TypeCheckResult {
  readonly valid: boolean;
  readonly errors: string[];
}

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
]);

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

// ---------------------------------------------------------------------------
// TypeRegistry
// ---------------------------------------------------------------------------

/** Central registry for SysML types with subtype tracking. */
export class TypeRegistry {
  private readonly types = new Map<string, SysMLType>();

  /** Register a type in the registry. */
  registerType(type: SysMLType): void {
    this.types.set(type.name, type);
  }

  /** Look up a type by name. */
  getType(name: string): SysMLType | undefined {
    return this.types.get(name);
  }

  /** Check whether `sub` is a (transitive) subtype of `super_`. */
  isSubtypeOf(sub: SysMLType, super_: SysMLType): boolean {
    if (sub.name === super_.name) {
      return true;
    }
    const visited = new Set<string>();
    const queue = [...sub.supertypes];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.name === super_.name) {
        return true;
      }
      if (!visited.has(current.name)) {
        visited.add(current.name);
        queue.push(...current.supertypes);
      }
    }
    return false;
  }

  /** Find the first common supertype of two types, if any. */
  getCommonSupertype(a: SysMLType, b: SysMLType): SysMLType | undefined {
    const aAncestors = this.collectAncestors(a);
    const queue = [b, ...b.supertypes];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (aAncestors.has(current.name)) {
        return current;
      }
      if (!visited.has(current.name)) {
        visited.add(current.name);
        queue.push(...current.supertypes);
      }
    }
    return undefined;
  }

  /** Register the SysML v2 primitive types. */
  registerPrimitiveTypes(): void {
    const primitives = ['Boolean', 'Integer', 'Real', 'String', 'Natural', 'Complex', 'UnlimitedNatural'];
    for (const name of primitives) {
      this.registerType({ name, kind: 'primitive', supertypes: [], features: [] });
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private collectAncestors(t: SysMLType): Set<string> {
    const ancestors = new Set<string>([t.name]);
    const queue = [...t.supertypes];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!ancestors.has(current.name)) {
        ancestors.add(current.name);
        queue.push(...current.supertypes);
      }
    }
    return ancestors;
  }
}

// ---------------------------------------------------------------------------
// TypeChecker
// ---------------------------------------------------------------------------

/** Validates typing and specialization relationships between AST nodes. */
export class TypeChecker {
  constructor(private readonly registry: TypeRegistry) {}

  /** Check that a usage node is validly typed by a definition node. */
  checkTyping(usage: ASTNode, definition: ASTNode): TypeCheckResult {
    const errors: string[] = [];

    if (!USAGE_KINDS.has(usage.kind)) {
      errors.push(`Node '${usage.name ?? '<anonymous>'}' is not a usage element`);
    }
    if (!DEFINITION_KINDS.has(definition.kind)) {
      errors.push(`Node '${definition.name ?? '<anonymous>'}' is not a definition element`);
    }

    if (errors.length === 0) {
      // Verify the kind families match (e.g. PartUsage → PartDefinition)
      const usageBase = usage.kind.replace('Usage', '');
      const defBase = definition.kind.replace('Definition', '');
      if (usageBase !== defBase) {
        errors.push(
          `Kind mismatch: '${usage.kind}' cannot be typed by '${definition.kind}'`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /** Check that a specialization (sub specializes super) is valid. */
  checkSpecialization(sub: ASTNode, super_: ASTNode): TypeCheckResult {
    const errors: string[] = [];

    if (!DEFINITION_KINDS.has(sub.kind)) {
      errors.push(`Sub-element '${sub.name ?? '<anonymous>'}' is not a definition`);
    }
    if (!DEFINITION_KINDS.has(super_.kind)) {
      errors.push(`Super-element '${super_.name ?? '<anonymous>'}' is not a definition`);
    }

    if (errors.length === 0) {
      const subType = this.registry.getType(sub.name ?? '');
      const superType = this.registry.getType(super_.name ?? '');

      if (subType && superType && subType.name === superType.name) {
        errors.push(`A type cannot specialize itself: '${subType.name}'`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
