import type { AstNode } from '@easy-sysml/ast';
import { walkAst } from '@easy-sysml/ast';
import type { EdgeType } from '@easy-sysml/protocol';
import type { Scope } from './scope.js';
import type { Symbol, SymbolTable } from './symbol-table.js';

/** A resolved reference from one element to another */
export interface ResolvedReference {
  source: AstNode;
  target: Symbol;
  kind: EdgeType;
  referenceName: string;
}

/** Unresolved reference (for error reporting) */
export interface UnresolvedReference {
  source: AstNode;
  referenceName: string;
  kind: EdgeType;
  message: string;
  line: number;
  column: number;
}

/** Reference resolver - links cross-references in the AST */
export class ReferenceResolver {
  private resolved: ResolvedReference[] = [];
  private unresolved: UnresolvedReference[] = [];

  constructor(
    private symbolTable: SymbolTable,
    private rootScope: Scope,
  ) {}

  /** Resolve all references in the AST */
  resolveAll(root: AstNode): void {
    this.resolved = [];
    this.unresolved = [];
    this.resolveNode(root, this.rootScope);
  }

  /** Get resolved references */
  getResolved(): ResolvedReference[] {
    return this.resolved;
  }

  /** Get unresolved references (for diagnostics) */
  getUnresolved(): UnresolvedReference[] {
    return this.unresolved;
  }

  /** Find all references to a symbol */
  findReferences(symbol: Symbol): ResolvedReference[] {
    return this.resolved.filter((ref) => ref.target === symbol);
  }

  private resolveNode(node: AstNode, scope: Scope): void {
    const nodeType = node.$type;

    // Determine the scope for children of this node
    const name = (node as unknown as Record<string, unknown>).name as string | undefined;
    const childScope = name && scope.getChild(name) ? scope.getChild(name)! : scope;

    // Resolve type references (typings)
    this.resolveTyping(node, childScope);

    // Resolve specialization references
    this.resolveSpecialization(node, childScope);

    // Resolve import references
    this.resolveImport(node, childScope);

    // Process children
    for (const key of Object.keys(node)) {
      if (key.startsWith('$')) continue;
      const value = (node as unknown as Record<string, unknown>)[key];

      if (Array.isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) {
            // Membership nodes: resolve the member element in the parent's child scope
            if (item.$type === 'Membership') {
              const memberElement = (item as unknown as Record<string, unknown>).memberElement as AstNode | undefined;
              if (memberElement) {
                this.resolveNode(memberElement, childScope);
              }
            } else {
              this.resolveNode(item, childScope);
            }
          }
        }
      } else if (isAstNode(value)) {
        this.resolveNode(value, childScope);
      }
    }
  }

  private resolveTyping(node: AstNode, scope: Scope): void {
    const typings = (node as unknown as Record<string, unknown>).typings as
      | Array<{ $type: string; $id: string; type?: string }>
      | undefined;
    if (!typings) return;

    for (const typing of typings) {
      if (!typing.type) continue;

      const target = scope.resolve(typing.type) ?? scope.resolveQualified(typing.type);
      const range = node.$range;
      const line = range?.start?.line ?? 0;
      const column = range?.start?.character ?? 0;

      if (target) {
        this.resolved.push({
          source: node,
          target,
          kind: 'typing' as EdgeType,
          referenceName: typing.type,
        });

        // Link the usage symbol to its definition
        const sourceSymbol = this.symbolTable.getForNode(node);
        if (sourceSymbol) {
          sourceSymbol.definition = target;
          sourceSymbol.type = target;
        }
      } else {
        this.unresolved.push({
          source: node,
          referenceName: typing.type,
          kind: 'typing' as EdgeType,
          message: `Cannot resolve type '${typing.type}'`,
          line,
          column,
        });
      }
    }
  }

  private resolveSpecialization(node: AstNode, scope: Scope): void {
    const specializations = (node as unknown as Record<string, unknown>).specializations as
      | Array<{ $type: string; $id: string; general?: string }>
      | undefined;
    if (!specializations) return;

    for (const spec of specializations) {
      if (!spec.general) continue;

      const target = scope.resolve(spec.general) ?? scope.resolveQualified(spec.general);
      const range = node.$range;
      const line = range?.start?.line ?? 0;
      const column = range?.start?.character ?? 0;

      if (target) {
        this.resolved.push({
          source: node,
          target,
          kind: 'specialization' as EdgeType,
          referenceName: spec.general,
        });
      } else {
        this.unresolved.push({
          source: node,
          referenceName: spec.general,
          kind: 'specialization' as EdgeType,
          message: `Cannot resolve specialization target '${spec.general}'`,
          line,
          column,
        });
      }
    }
  }

  private resolveImport(node: AstNode, scope: Scope): void {
    if (node.$type !== 'Import') return;

    const importedNamespace = (node as unknown as Record<string, unknown>).importedNamespace as string | undefined;
    if (!importedNamespace) return;

    const target = this.rootScope.resolve(importedNamespace) ?? this.rootScope.resolveQualified(importedNamespace);
    const range = node.$range;
    const line = range?.start?.line ?? 0;
    const column = range?.start?.character ?? 0;

    if (target) {
      this.resolved.push({
        source: node,
        target,
        kind: 'import' as EdgeType,
        referenceName: importedNamespace,
      });
    } else {
      this.unresolved.push({
        source: node,
        referenceName: importedNamespace,
        kind: 'import' as EdgeType,
        message: `Cannot resolve imported namespace '${importedNamespace}'`,
        line,
        column,
      });
    }
  }
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AstNode).$type === 'string' &&
    typeof (value as AstNode).$id === 'string'
  );
}
