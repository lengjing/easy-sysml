import { describe, it, expect, beforeEach } from 'vitest';
import { SysMLElementKind } from '@easy-sysml/protocol';
import type { Range } from '@easy-sysml/protocol';
import {
  addChild,
  removeChild,
  replaceNode,
  updateNodeRange,
  diffTrees,
} from '../mutation.js';
import {
  createPackage,
  createDefinition,
  createUsage,
  createNode,
  resetAnonymousCounter,
} from '../ast-factory.js';
import type { ASTNode } from '../ast-node.js';

const range: Range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 10 },
};

beforeEach(() => {
  resetAnonymousCounter();
});

describe('addChild', () => {
  it('adds a child and sets parent', () => {
    const parent = createPackage('Root', range);
    const child = createDefinition(SysMLElementKind.PartDefinition, 'Part', range);

    addChild(parent, child);

    expect(parent.children).toContain(child);
    expect(child.parent).toBe(parent);
  });

  it('inserts at a specific index', () => {
    const parent = createPackage('Root', range);
    const first = createNode(SysMLElementKind.PartUsage, 'A', range);
    const second = createNode(SysMLElementKind.PartUsage, 'B', range);
    const inserted = createNode(SysMLElementKind.PartUsage, 'C', range);

    addChild(parent, first);
    addChild(parent, second);
    addChild(parent, inserted, 1);

    expect(parent.children[1]).toBe(inserted);
    expect(parent.children).toHaveLength(3);
  });

  it('removes child from previous parent', () => {
    const parent1 = createPackage('P1', range);
    const parent2 = createPackage('P2', range);
    const child = createNode(SysMLElementKind.PartUsage, 'X', range);

    addChild(parent1, child);
    expect(parent1.children).toContain(child);

    addChild(parent2, child);
    expect(parent1.children).not.toContain(child);
    expect(parent2.children).toContain(child);
    expect(child.parent).toBe(parent2);
  });
});

describe('removeChild', () => {
  it('removes a child and clears parent', () => {
    const parent = createPackage('Root', range);
    const child = createNode(SysMLElementKind.PartUsage, 'A', range);
    addChild(parent, child);

    const result = removeChild(parent, child);

    expect(result).toBe(true);
    expect(parent.children).toHaveLength(0);
    expect(child.parent).toBeUndefined();
  });

  it('returns false if child not found', () => {
    const parent = createPackage('Root', range);
    const unrelated = createNode(SysMLElementKind.PartUsage, 'Z', range);

    expect(removeChild(parent, unrelated)).toBe(false);
  });
});

describe('replaceNode', () => {
  it('replaces a node in parent children', () => {
    const parent = createPackage('Root', range);
    const original = createNode(SysMLElementKind.PartUsage, 'Old', range);
    const replacement = createNode(SysMLElementKind.PartUsage, 'New', range);

    addChild(parent, original);
    replaceNode(original, replacement);

    expect(parent.children).toContain(replacement);
    expect(parent.children).not.toContain(original);
    expect(replacement.parent).toBe(parent);
    expect(original.parent).toBeUndefined();
  });

  it('preserves position in children array', () => {
    const parent = createPackage('Root', range);
    const a = createNode(SysMLElementKind.PartUsage, 'A', range);
    const b = createNode(SysMLElementKind.PartUsage, 'B', range);
    const c = createNode(SysMLElementKind.PartUsage, 'C', range);
    const replacement = createNode(SysMLElementKind.PartUsage, 'B2', range);

    addChild(parent, a);
    addChild(parent, b);
    addChild(parent, c);
    replaceNode(b, replacement);

    expect(parent.children[0]).toBe(a);
    expect(parent.children[1]).toBe(replacement);
    expect(parent.children[2]).toBe(c);
  });
});

describe('updateNodeRange', () => {
  it('updates the range of a node', () => {
    const node = createNode(SysMLElementKind.PartUsage, 'A', range);
    const newRange: Range = {
      start: { line: 5, character: 2 },
      end: { line: 10, character: 8 },
    };

    updateNodeRange(node, newRange);

    expect(node.range).toEqual(newRange);
  });
});

describe('diffTrees', () => {
  it('detects added nodes', () => {
    const old = createPackage('Root', range);
    const oldChild = createNode(SysMLElementKind.PartUsage, 'A', range);
    addChild(old, oldChild);

    resetAnonymousCounter();
    const neo = createPackage('Root', range);
    const neoChild = createNode(SysMLElementKind.PartUsage, 'A', range);
    const added = createNode(SysMLElementKind.PartUsage, 'B', range);
    addChild(neo, neoChild);
    addChild(neo, added);

    const diff = diffTrees(old, neo);
    expect(diff.added.length).toBeGreaterThanOrEqual(1);
    expect(diff.added.some((n) => n.name === 'B')).toBe(true);
  });

  it('detects removed nodes', () => {
    const old = createPackage('Root', range);
    const childA = createNode(SysMLElementKind.PartUsage, 'A', range);
    const childB = createNode(SysMLElementKind.PartUsage, 'B', range);
    addChild(old, childA);
    addChild(old, childB);

    resetAnonymousCounter();
    const neo = createPackage('Root', range);
    const neoChildA = createNode(SysMLElementKind.PartUsage, 'A', range);
    addChild(neo, neoChildA);

    const diff = diffTrees(old, neo);
    expect(diff.removed.length).toBeGreaterThanOrEqual(1);
    expect(diff.removed.some((n) => n.name === 'B')).toBe(true);
  });

  it('detects modified nodes', () => {
    const old = createPackage('Root', range);
    const oldChild = createNode(SysMLElementKind.PartUsage, 'A', range);
    addChild(old, oldChild);

    resetAnonymousCounter();
    const neo = createPackage('Root', range);
    const modifiedRange: Range = {
      start: { line: 5, character: 0 },
      end: { line: 10, character: 0 },
    };
    const neoChild = createNode(SysMLElementKind.PartUsage, 'A', modifiedRange);
    addChild(neo, neoChild);

    const diff = diffTrees(old, neo);
    expect(diff.modified.length).toBeGreaterThanOrEqual(1);
    expect(diff.modified.some((m) => m.changes.includes('range'))).toBe(true);
  });
});
