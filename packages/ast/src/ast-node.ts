// ---------------------------------------------------------------------------
// Core AST node types for SysML v2
// ---------------------------------------------------------------------------

import type {
  SysMLElementKind,
  VisibilityKind,
  RelationshipKind,
  Range,
} from '@easy-sysml/protocol';

import type { NodeId } from './node-id.js';

// ---------------------------------------------------------------------------
// Base AST node
// ---------------------------------------------------------------------------

/** Base interface for all AST nodes. */
export interface ASTNode {
  id: NodeId;
  kind: SysMLElementKind;
  name?: string;
  shortName?: string;
  visibility?: VisibilityKind;
  parent?: ASTNode;
  children: ASTNode[];
  properties: Record<string, unknown>;
  range: Range;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Concrete node subtypes
// ---------------------------------------------------------------------------

/** A SysML package containing imports and member elements. */
export interface PackageNode extends ASTNode {
  imports: ImportNode[];
  members: ASTNode[];
}

/** A definition element (e.g. PartDefinition, ActionDefinition). */
export interface DefinitionNode extends ASTNode {
  specializations: string[];
  ownedFeatures: ASTNode[];
}

/** A usage element (e.g. PartUsage, AttributeUsage). */
export interface UsageNode extends ASTNode {
  typings: string[];
  subsettings: string[];
  redefinitions: string[];
  multiplicity?: MultiplicityNode;
}

/** A feature with direction and composition information. */
export interface FeatureNode extends ASTNode {
  direction?: 'in' | 'out' | 'inout';
  isComposite: boolean;
  isOrdered: boolean;
}

/** A relationship between a source and target element. */
export interface RelationshipNode extends ASTNode {
  source: ASTNode;
  target: ASTNode;
  relationshipKind: RelationshipKind;
}

/** An expression with an operator and operands. */
export interface ExpressionNode extends ASTNode {
  operator: string;
  operands: ASTNode[];
}

/** A literal value node. */
export interface LiteralNode extends ASTNode {
  value: string | number | boolean;
}

/** A comment or documentation node. */
export interface CommentNode extends ASTNode {
  body: string;
}

/** An import statement referencing a namespace. */
export interface ImportNode extends ASTNode {
  importedNamespace: string;
  isRecursive: boolean;
  isWildcard: boolean;
}

/** A connector linking multiple ends. */
export interface ConnectorNode extends ASTNode {
  ends: ASTNode[];
}

/** A multiplicity specification. */
export interface MultiplicityNode extends ASTNode {
  lower?: number;
  upper?: number | '*';
}

/** An annotation on an element. */
export interface AnnotationNode extends ASTNode {
  annotatedElement?: string;
}
