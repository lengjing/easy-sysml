// ---------------------------------------------------------------------------
// AST serialization / deserialization
// ---------------------------------------------------------------------------

import type { ASTNode } from './ast-node.js';
import type { NodeId } from './node-id.js';
import type { SysMLElementKind, VisibilityKind, Range } from '@easy-sysml/protocol';

// ---------------------------------------------------------------------------
// Plain-object representation (no circular parent refs)
// ---------------------------------------------------------------------------

/** A JSON-safe representation of an ASTNode. */
export interface PlainASTNode {
  id: string;
  kind: string;
  name?: string;
  shortName?: string;
  visibility?: string;
  children: PlainASTNode[];
  properties: Record<string, unknown>;
  range: Range;
  metadata?: Record<string, unknown>;
  // Extra fields from subtypes are preserved in `extra`.
  extra?: Record<string, unknown>;
}

/**
 * Convert an AST node (and its descendants) to a plain object that is safe
 * for JSON serialization (no circular parent references).
 */
export function toPlainObject(node: ASTNode): PlainASTNode {
  const extra = collectExtraFields(node);

  const plain: PlainASTNode = {
    id: node.id,
    kind: node.kind as string,
    children: node.children.map(toPlainObject),
    properties: { ...node.properties },
    range: node.range,
  };

  if (node.name !== undefined) {
    plain.name = node.name;
  }
  if (node.shortName !== undefined) {
    plain.shortName = node.shortName;
  }
  if (node.visibility !== undefined) {
    plain.visibility = node.visibility as string;
  }
  if (node.metadata !== undefined) {
    plain.metadata = { ...node.metadata };
  }
  if (Object.keys(extra).length > 0) {
    plain.extra = extra;
  }

  return plain;
}

/**
 * Reconstruct an AST node tree from a plain object.
 * Re-establishes parent links on all children.
 */
export function fromPlainObject(obj: PlainASTNode | Record<string, unknown>): ASTNode {
  const plain = obj as PlainASTNode;

  const node: ASTNode = {
    id: plain.id as NodeId,
    kind: plain.kind as SysMLElementKind,
    name: plain.name,
    shortName: plain.shortName,
    visibility: plain.visibility as VisibilityKind | undefined,
    children: [],
    properties: plain.properties ?? {},
    range: plain.range,
    metadata: plain.metadata,
  };

  // Restore extra subtype fields
  if (plain.extra) {
    for (const [key, value] of Object.entries(plain.extra)) {
      (node as unknown as Record<string, unknown>)[key] = value;
    }
  }

  // Recursively rebuild children and set parent references
  if (Array.isArray(plain.children)) {
    for (const childObj of plain.children) {
      const child = fromPlainObject(childObj);
      child.parent = node;
      node.children.push(child);
    }
  }

  return node;
}

// ---------------------------------------------------------------------------
// JSON string serialization
// ---------------------------------------------------------------------------

/** Serialize an AST node tree to a JSON string. */
export function serialize(node: ASTNode): string {
  return JSON.stringify(toPlainObject(node));
}

/** Deserialize a JSON string back into an AST node tree. */
export function deserialize(json: string): ASTNode {
  const plain = JSON.parse(json) as PlainASTNode;
  return fromPlainObject(plain);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Well-known keys on ASTNode that are handled explicitly. */
const BASE_KEYS = new Set([
  'id',
  'kind',
  'name',
  'shortName',
  'visibility',
  'parent',
  'children',
  'properties',
  'range',
  'metadata',
]);

/**
 * Collect any additional fields present on subtypes (e.g. `body` on
 * CommentNode, `value` on LiteralNode) while skipping ASTNode references
 * to avoid circular structures.
 */
function collectExtraFields(node: ASTNode): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    if (BASE_KEYS.has(key)) {
      continue;
    }
    const val = (node as unknown as Record<string, unknown>)[key];
    // Skip ASTNode references (they'd be circular or duplicated)
    if (isASTNodeLike(val)) {
      continue;
    }
    // Skip arrays of ASTNode references
    if (Array.isArray(val) && val.length > 0 && isASTNodeLike(val[0])) {
      continue;
    }
    extra[key] = val;
  }
  return extra;
}

function isASTNodeLike(val: unknown): val is ASTNode {
  return (
    typeof val === 'object' &&
    val !== null &&
    'id' in val &&
    'kind' in val &&
    'children' in val
  );
}
