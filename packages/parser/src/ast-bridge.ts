/**
 * Bridge between Langium-generated AST and @easy-sysml/ast types.
 * Maps Langium AST nodes to our domain AST nodes for use by
 * the semantic layer and other downstream consumers.
 */
import type { ASTNode, PackageNode, DefinitionNode, UsageNode, CommentNode, ImportNode } from '@easy-sysml/ast';
import { createNode, createPackage, createDefinition, createUsage, createComment, createImport } from '@easy-sysml/ast';
import { SysMLElementKind } from '@easy-sysml/protocol';
import type { AstNode } from 'langium';
import type { Range } from '@easy-sysml/protocol';
import {
  isPackage,
  isPartDefinition,
  isPartUsage,
  isAttributeDefinition,
  isAttributeUsage,
  isPortDefinition,
  isPortUsage,
  isActionDefinition,
  isActionUsage,
  isStateDefinition,
  isStateUsage,
  isRequirementDefinition,
  isRequirementUsage,
  isComment,
  isNamespace,
  type Namespace,
  type Package,
  type PartDefinition,
  type PartUsage,
  type Comment as LangiumComment,
} from './generated/ast.js';

const EMPTY_RANGE: Range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

/** Extract a Range from a Langium CstNode */
function extractRange(node: AstNode): Range {
  const cst = node.$cstNode;
  if (!cst) return EMPTY_RANGE;
  return {
    start: {
      line: cst.range.start.line,
      character: cst.range.start.character,
    },
    end: {
      line: cst.range.end.line,
      character: cst.range.end.character,
    },
  };
}

/** Get the declared name from a Langium AST node that has declaredName */
function getName(node: any): string | undefined {
  return node.declaredName ?? node.declaredShortName ?? undefined;
}

/**
 * Convert a Langium AST root node tree into @easy-sysml/ast nodes.
 * Returns an array of top-level ASTNode elements.
 */
export function bridgeAst(langiumNode: AstNode): ASTNode[] {
  const results: ASTNode[] = [];
  if (isNamespace(langiumNode)) {
    const ns = langiumNode as Namespace;
    for (const rel of ns.ownedRelationship ?? []) {
      const child = bridgeSingle(rel);
      if (child) results.push(child);
    }
  }
  return results;
}

function bridgeSingle(node: AstNode): ASTNode | undefined {
  // Members contain owned elements
  const owned = (node as any).ownedRelatedElement ?? (node as any).ownedRelationship;
  if (Array.isArray(owned)) {
    for (const child of owned) {
      const result = bridgeSingle(child);
      if (result) return result;
    }
  }

  if (isPackage(node)) {
    return bridgePackage(node as Package);
  }
  if (isPartDefinition(node)) {
    return bridgeDefinition(node as PartDefinition, SysMLElementKind.PartDefinition);
  }
  if (isPartUsage(node)) {
    return bridgeUsage(node, SysMLElementKind.PartUsage);
  }
  if (isAttributeDefinition(node)) {
    return bridgeDefinition(node, SysMLElementKind.AttributeDefinition);
  }
  if (isAttributeUsage(node)) {
    return bridgeUsage(node, SysMLElementKind.AttributeUsage);
  }
  if (isPortDefinition(node)) {
    return bridgeDefinition(node, SysMLElementKind.PortDefinition);
  }
  if (isPortUsage(node)) {
    return bridgeUsage(node, SysMLElementKind.PortUsage);
  }
  if (isActionDefinition(node)) {
    return bridgeDefinition(node, SysMLElementKind.ActionDefinition);
  }
  if (isActionUsage(node)) {
    return bridgeUsage(node, SysMLElementKind.ActionUsage);
  }
  if (isStateDefinition(node)) {
    return bridgeDefinition(node, SysMLElementKind.StateDefinition);
  }
  if (isStateUsage(node)) {
    return bridgeUsage(node, SysMLElementKind.StateUsage);
  }
  if (isRequirementDefinition(node)) {
    return bridgeDefinition(node, SysMLElementKind.RequirementDefinition);
  }
  if (isRequirementUsage(node)) {
    return bridgeUsage(node, SysMLElementKind.RequirementUsage);
  }
  if (isComment(node)) {
    return bridgeComment(node as LangiumComment);
  }

  return undefined;
}

function bridgePackage(node: Package): PackageNode {
  const name = getName(node) ?? '<anonymous>';
  const range = extractRange(node);
  const pkg = createPackage(name, range);
  for (const rel of node.ownedRelationship ?? []) {
    const child = bridgeSingle(rel);
    if (child) {
      pkg.children.push(child);
    }
  }
  return pkg;
}

function bridgeDefinition(node: any, kind: SysMLElementKind): DefinitionNode {
  const name = getName(node) ?? '<anonymous>';
  const range = extractRange(node);
  return createDefinition(kind, name, range);
}

function bridgeUsage(node: any, kind: SysMLElementKind): UsageNode {
  const name = getName(node) ?? '<anonymous>';
  const range = extractRange(node);
  return createUsage(kind, name, range);
}

function bridgeComment(node: LangiumComment): CommentNode {
  const body = (node as any).body ?? '';
  const range = extractRange(node);
  return createComment(body, range);
}
