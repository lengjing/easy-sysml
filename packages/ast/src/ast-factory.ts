// ---------------------------------------------------------------------------
// Factory functions for creating AST nodes
// ---------------------------------------------------------------------------

import {
  SysMLElementKind,
  VisibilityKind,
  RelationshipKind,
} from '@easy-sysml/protocol';
import type { Range } from '@easy-sysml/protocol';

import { generateNodeId } from './node-id.js';
import type { NodeId } from './node-id.js';
import type {
  ASTNode,
  PackageNode,
  DefinitionNode,
  UsageNode,
  FeatureNode,
  RelationshipNode,
  LiteralNode,
  CommentNode,
  ImportNode,
} from './ast-node.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface CreateNodeOptions {
  parent?: ASTNode;
  visibility?: VisibilityKind;
  shortName?: string;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a SysMLElementKind to a short prefix for use in NodeIds. */
function kindPrefix(kind: SysMLElementKind): string {
  switch (kind) {
    case SysMLElementKind.Package:
      return 'pkg';
    case SysMLElementKind.PartDefinition:
    case SysMLElementKind.PartUsage:
      return 'part';
    case SysMLElementKind.AttributeDefinition:
    case SysMLElementKind.AttributeUsage:
      return 'attr';
    case SysMLElementKind.ActionDefinition:
    case SysMLElementKind.ActionUsage:
      return 'act';
    case SysMLElementKind.StateDefinition:
    case SysMLElementKind.StateUsage:
      return 'state';
    case SysMLElementKind.RequirementDefinition:
    case SysMLElementKind.RequirementUsage:
      return 'req';
    case SysMLElementKind.PortDefinition:
    case SysMLElementKind.PortUsage:
      return 'port';
    case SysMLElementKind.ConnectionDefinition:
    case SysMLElementKind.ConnectionUsage:
      return 'conn';
    case SysMLElementKind.InterfaceDefinition:
    case SysMLElementKind.InterfaceUsage:
      return 'iface';
    case SysMLElementKind.ItemDefinition:
    case SysMLElementKind.ItemUsage:
      return 'item';
    case SysMLElementKind.FlowConnectionDefinition:
    case SysMLElementKind.FlowConnectionUsage:
      return 'flow';
    case SysMLElementKind.Comment:
    case SysMLElementKind.Documentation:
      return 'comment';
    case SysMLElementKind.Import:
      return 'import';
    case SysMLElementKind.Feature:
      return 'feat';
    case SysMLElementKind.Connector:
      return 'connector';
    case SysMLElementKind.Multiplicity:
      return 'mult';
    case SysMLElementKind.LiteralInteger:
    case SysMLElementKind.LiteralString:
    case SysMLElementKind.LiteralReal:
    case SysMLElementKind.LiteralBoolean:
      return 'lit';
    case SysMLElementKind.AnnotatingElement:
      return 'annot';
    default:
      return 'el';
  }
}

let anonymousCounter = 0;

function nextAnonymousName(): string {
  return `$anon_${++anonymousCounter}`;
}

/** Reset the anonymous counter (mainly for testing). */
export function resetAnonymousCounter(): void {
  anonymousCounter = 0;
}

// ---------------------------------------------------------------------------
// Generic node factory
// ---------------------------------------------------------------------------

/**
 * Create a generic AST node of the given kind.
 */
export function createNode(
  kind: SysMLElementKind,
  name: string | undefined,
  range: Range,
  options?: CreateNodeOptions,
): ASTNode {
  const nodeName = name ?? nextAnonymousName();
  const parentId = options?.parent?.id ?? null;
  const id = generateNodeId(parentId, kindPrefix(kind), nodeName);

  const node: ASTNode = {
    id,
    kind,
    name: name ?? undefined,
    shortName: options?.shortName,
    visibility: options?.visibility,
    parent: options?.parent,
    children: [],
    properties: options?.properties ?? {},
    range,
    metadata: options?.metadata,
  };

  if (options?.parent) {
    options.parent.children.push(node);
  }

  return node;
}

// ---------------------------------------------------------------------------
// Specialised factories
// ---------------------------------------------------------------------------

export function createPackage(name: string, range: Range, options?: CreateNodeOptions): PackageNode {
  const base = createNode(SysMLElementKind.Package, name, range, options);
  return Object.assign(base, {
    imports: [] as ImportNode[],
    members: [] as ASTNode[],
  }) as PackageNode;
}

export function createDefinition(
  kind: SysMLElementKind,
  name: string,
  range: Range,
  options?: CreateNodeOptions,
): DefinitionNode {
  const base = createNode(kind, name, range, options);
  return Object.assign(base, {
    specializations: [] as string[],
    ownedFeatures: [] as ASTNode[],
  }) as DefinitionNode;
}

export function createUsage(
  kind: SysMLElementKind,
  name: string,
  range: Range,
  options?: CreateNodeOptions,
): UsageNode {
  const base = createNode(kind, name, range, options);
  return Object.assign(base, {
    typings: [] as string[],
    subsettings: [] as string[],
    redefinitions: [] as string[],
    multiplicity: undefined,
  }) as UsageNode;
}

export function createFeature(
  name: string,
  range: Range,
  direction?: 'in' | 'out' | 'inout',
  options?: CreateNodeOptions,
): FeatureNode {
  const base = createNode(SysMLElementKind.Feature, name, range, options);
  return Object.assign(base, {
    direction,
    isComposite: false,
    isOrdered: false,
  }) as FeatureNode;
}

export function createRelationship(
  kind: RelationshipKind,
  source: ASTNode,
  target: ASTNode,
  range: Range,
  options?: CreateNodeOptions,
): RelationshipNode {
  const relKindToElementKind: Record<string, SysMLElementKind> = {
    [RelationshipKind.Specialization]: SysMLElementKind.Specialization,
    [RelationshipKind.Redefinition]: SysMLElementKind.Redefinition,
    [RelationshipKind.Subsetting]: SysMLElementKind.Subsetting,
    [RelationshipKind.FeatureTyping]: SysMLElementKind.FeatureTyping,
    [RelationshipKind.Conjugation]: SysMLElementKind.Conjugation,
    [RelationshipKind.Dependency]: SysMLElementKind.Dependency,
    [RelationshipKind.Connector]: SysMLElementKind.Connector,
  };

  const elementKind =
    relKindToElementKind[kind] ?? SysMLElementKind.Specialization;
  const name = `${source.name ?? 'src'}->${target.name ?? 'tgt'}`;
  const base = createNode(elementKind, name, range, options);

  return Object.assign(base, {
    source,
    target,
    relationshipKind: kind,
  }) as RelationshipNode;
}

export function createLiteral(
  value: string | number | boolean,
  range: Range,
  options?: CreateNodeOptions,
): LiteralNode {
  let kind: SysMLElementKind;
  switch (typeof value) {
    case 'number':
      kind = Number.isInteger(value)
        ? SysMLElementKind.LiteralInteger
        : SysMLElementKind.LiteralReal;
      break;
    case 'boolean':
      kind = SysMLElementKind.LiteralBoolean;
      break;
    default:
      kind = SysMLElementKind.LiteralString;
      break;
  }

  const base = createNode(kind, String(value), range, options);
  return Object.assign(base, { value }) as LiteralNode;
}

export function createComment(
  body: string,
  range: Range,
  options?: CreateNodeOptions,
): CommentNode {
  const base = createNode(SysMLElementKind.Comment, undefined, range, options);
  return Object.assign(base, { body }) as CommentNode;
}

export function createImport(
  namespace: string,
  range: Range,
  isRecursive = false,
  isWildcard = false,
  options?: CreateNodeOptions,
): ImportNode {
  const base = createNode(SysMLElementKind.Import, namespace, range, options);
  return Object.assign(base, {
    importedNamespace: namespace,
    isRecursive,
    isWildcard,
  }) as ImportNode;
}
