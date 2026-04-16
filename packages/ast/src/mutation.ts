// ---------------------------------------------------------------------------
// Incremental AST mutation operations
// ---------------------------------------------------------------------------

import type { Range } from '@easy-sysml/protocol';
import type { ASTNode } from './ast-node.js';

// ---------------------------------------------------------------------------
// Child management
// ---------------------------------------------------------------------------

/**
 * Add a child node to a parent.  Sets the child's parent reference and
 * inserts at the given index (defaults to appending).
 */
export function addChild(
  parent: ASTNode,
  child: ASTNode,
  index?: number,
): void {
  // Remove from previous parent if any
  if (child.parent && child.parent !== parent) {
    removeChild(child.parent, child);
  }

  child.parent = parent;

  if (index !== undefined && index >= 0 && index < parent.children.length) {
    parent.children.splice(index, 0, child);
  } else {
    parent.children.push(child);
  }
}

/**
 * Remove a child node from its parent. Returns true if the child was found
 * and removed.
 */
export function removeChild(parent: ASTNode, child: ASTNode): boolean {
  const idx = parent.children.indexOf(child);
  if (idx === -1) {
    return false;
  }
  parent.children.splice(idx, 1);
  child.parent = undefined;
  return true;
}

/**
 * Replace an existing node in its parent's children list with a new node.
 * The new node inherits the old node's parent link.
 */
export function replaceNode(oldNode: ASTNode, newNode: ASTNode): void {
  const parent = oldNode.parent;
  if (!parent) {
    return;
  }

  const idx = parent.children.indexOf(oldNode);
  if (idx === -1) {
    return;
  }

  // Remove newNode from its current parent if it has one
  if (newNode.parent && newNode.parent !== parent) {
    removeChild(newNode.parent, newNode);
  }

  parent.children[idx] = newNode;
  newNode.parent = parent;
  oldNode.parent = undefined;
}

/**
 * Update the source range of a node.
 */
export function updateNodeRange(node: ASTNode, newRange: Range): void {
  node.range = newRange;
}

// ---------------------------------------------------------------------------
// Tree diffing
// ---------------------------------------------------------------------------

/** A record of a node whose properties changed. */
export interface ModifiedEntry {
  node: ASTNode;
  changes: string[];
}

/** Differences between two AST trees. */
export interface ASTDiff {
  added: ASTNode[];
  removed: ASTNode[];
  modified: ModifiedEntry[];
}

/**
 * Compute a shallow diff between two AST roots by comparing nodes with
 * matching IDs.
 */
export function diffTrees(oldRoot: ASTNode, newRoot: ASTNode): ASTDiff {
  const oldIndex = indexById(oldRoot);
  const newIndex = indexById(newRoot);

  const added: ASTNode[] = [];
  const removed: ASTNode[] = [];
  const modified: ModifiedEntry[] = [];

  // Nodes present in new but not old → added
  for (const [id, node] of newIndex) {
    if (!oldIndex.has(id)) {
      added.push(node);
    }
  }

  // Nodes present in old but not new → removed
  for (const [id, node] of oldIndex) {
    if (!newIndex.has(id)) {
      removed.push(node);
    }
  }

  // Nodes present in both → check for modifications
  for (const [id, oldNode] of oldIndex) {
    const newNode = newIndex.get(id);
    if (!newNode) {
      continue;
    }
    const changes = detectChanges(oldNode, newNode);
    if (changes.length > 0) {
      modified.push({ node: newNode, changes });
    }
  }

  return { added, removed, modified };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indexById(root: ASTNode): Map<string, ASTNode> {
  const map = new Map<string, ASTNode>();
  const stack: ASTNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    map.set(node.id, node);
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }
  return map;
}

function detectChanges(oldNode: ASTNode, newNode: ASTNode): string[] {
  const changes: string[] = [];

  if (oldNode.name !== newNode.name) {
    changes.push('name');
  }
  if (oldNode.kind !== newNode.kind) {
    changes.push('kind');
  }
  if (oldNode.visibility !== newNode.visibility) {
    changes.push('visibility');
  }
  if (!rangesEqual(oldNode.range, newNode.range)) {
    changes.push('range');
  }
  if (oldNode.children.length !== newNode.children.length) {
    changes.push('children');
  }

  return changes;
}

function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.start.line === b.start.line &&
    a.start.character === b.start.character &&
    a.end.line === b.end.line &&
    a.end.character === b.end.character
  );
}
