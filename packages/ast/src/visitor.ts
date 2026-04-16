// ---------------------------------------------------------------------------
// AST visitor / traversal system
// ---------------------------------------------------------------------------

import type {
  ASTNode,
  PackageNode,
  DefinitionNode,
  UsageNode,
  FeatureNode,
  RelationshipNode,
  ExpressionNode,
  LiteralNode,
  CommentNode,
  ImportNode,
  ConnectorNode,
  MultiplicityNode,
  AnnotationNode,
} from './ast-node.js';

import { SysMLElementKind } from '@easy-sysml/protocol';

// ---------------------------------------------------------------------------
// Visitor interface
// ---------------------------------------------------------------------------

/** Visitor callbacks for each AST node type. All methods are optional. */
export interface ASTVisitor {
  visitNode(node: ASTNode): void;
  visitPackage(node: PackageNode): void;
  visitDefinition(node: DefinitionNode): void;
  visitUsage(node: UsageNode): void;
  visitFeature(node: FeatureNode): void;
  visitRelationship(node: RelationshipNode): void;
  visitExpression(node: ExpressionNode): void;
  visitLiteral(node: LiteralNode): void;
  visitComment(node: CommentNode): void;
  visitImport(node: ImportNode): void;
  visitConnector(node: ConnectorNode): void;
  visitMultiplicity(node: MultiplicityNode): void;
  visitAnnotation(node: AnnotationNode): void;
}

// ---------------------------------------------------------------------------
// Kind → visitor dispatch
// ---------------------------------------------------------------------------

function dispatchVisitor(node: ASTNode, visitor: Partial<ASTVisitor>): void {
  switch (node.kind) {
    case SysMLElementKind.Package:
      visitor.visitPackage?.(node as PackageNode);
      break;

    case SysMLElementKind.PartDefinition:
    case SysMLElementKind.AttributeDefinition:
    case SysMLElementKind.ActionDefinition:
    case SysMLElementKind.StateDefinition:
    case SysMLElementKind.RequirementDefinition:
    case SysMLElementKind.PortDefinition:
    case SysMLElementKind.ConnectionDefinition:
    case SysMLElementKind.InterfaceDefinition:
    case SysMLElementKind.ItemDefinition:
    case SysMLElementKind.FlowConnectionDefinition:
      visitor.visitDefinition?.(node as DefinitionNode);
      break;

    case SysMLElementKind.PartUsage:
    case SysMLElementKind.AttributeUsage:
    case SysMLElementKind.ActionUsage:
    case SysMLElementKind.StateUsage:
    case SysMLElementKind.RequirementUsage:
    case SysMLElementKind.PortUsage:
    case SysMLElementKind.ConnectionUsage:
    case SysMLElementKind.InterfaceUsage:
    case SysMLElementKind.ItemUsage:
    case SysMLElementKind.FlowConnectionUsage:
      visitor.visitUsage?.(node as UsageNode);
      break;

    case SysMLElementKind.Feature:
      visitor.visitFeature?.(node as FeatureNode);
      break;

    case SysMLElementKind.Specialization:
    case SysMLElementKind.Redefinition:
    case SysMLElementKind.Subsetting:
    case SysMLElementKind.FeatureTyping:
    case SysMLElementKind.Conjugation:
    case SysMLElementKind.Dependency:
      visitor.visitRelationship?.(node as RelationshipNode);
      break;

    case SysMLElementKind.LiteralInteger:
    case SysMLElementKind.LiteralString:
    case SysMLElementKind.LiteralReal:
    case SysMLElementKind.LiteralBoolean:
      visitor.visitLiteral?.(node as LiteralNode);
      break;

    case SysMLElementKind.Comment:
    case SysMLElementKind.Documentation:
      visitor.visitComment?.(node as CommentNode);
      break;

    case SysMLElementKind.Import:
      visitor.visitImport?.(node as ImportNode);
      break;

    case SysMLElementKind.Connector:
      visitor.visitConnector?.(node as ConnectorNode);
      break;

    case SysMLElementKind.Multiplicity:
      visitor.visitMultiplicity?.(node as MultiplicityNode);
      break;

    case SysMLElementKind.AnnotatingElement:
      visitor.visitAnnotation?.(node as AnnotationNode);
      break;

    default:
      break;
  }

  // Always fire the generic visitNode callback
  visitor.visitNode?.(node);
}

// ---------------------------------------------------------------------------
// Traversal functions
// ---------------------------------------------------------------------------

/** Depth-first pre-order walk of the AST. */
export function walk(node: ASTNode, visitor: Partial<ASTVisitor>): void {
  dispatchVisitor(node, visitor);
  for (const child of node.children) {
    walk(child, visitor);
  }
}

/** Walk from a node up to the root following parent links. */
export function walkUp(node: ASTNode, visitor: Partial<ASTVisitor>): void {
  let current: ASTNode | undefined = node;
  while (current) {
    dispatchVisitor(current, visitor);
    current = current.parent;
  }
}

/** Find the first node matching a predicate (depth-first). */
export function findNode(
  root: ASTNode,
  predicate: (n: ASTNode) => boolean,
): ASTNode | undefined {
  if (predicate(root)) {
    return root;
  }
  for (const child of root.children) {
    const found = findNode(child, predicate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** Find all nodes matching a predicate (depth-first). */
export function findAllNodes(
  root: ASTNode,
  predicate: (n: ASTNode) => boolean,
): ASTNode[] {
  const results: ASTNode[] = [];
  walk(root, {
    visitNode(n: ASTNode) {
      if (predicate(n)) {
        results.push(n);
      }
    },
  });
  return results;
}

/** Get all ancestors of a node, from immediate parent to root. */
export function getAncestors(node: ASTNode): ASTNode[] {
  const ancestors: ASTNode[] = [];
  let current = node.parent;
  while (current) {
    ancestors.push(current);
    current = current.parent;
  }
  return ancestors;
}

/** Get the depth of a node (root = 0). */
export function getDepth(node: ASTNode): number {
  let depth = 0;
  let current = node.parent;
  while (current) {
    depth++;
    current = current.parent;
  }
  return depth;
}

/** Map over all nodes in the tree (depth-first) and collect results. */
export function mapNodes<T>(root: ASTNode, fn: (n: ASTNode) => T): T[] {
  const results: T[] = [];
  walk(root, {
    visitNode(n: ASTNode) {
      results.push(fn(n));
    },
  });
  return results;
}
