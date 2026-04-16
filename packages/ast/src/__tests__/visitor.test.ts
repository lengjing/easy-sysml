import { describe, it, expect, beforeEach } from 'vitest';
import { SysMLElementKind } from '@easy-sysml/protocol';
import {
  walk,
  walkUp,
  findNode,
  findAllNodes,
  getAncestors,
  getDepth,
  mapNodes,
} from '../visitor.js';
import {
  createPackage,
  createDefinition,
  createUsage,
  createComment,
  resetAnonymousCounter,
} from '../ast-factory.js';
import { addChild } from '../mutation.js';
import type { ASTNode } from '../ast-node.js';
import type { Range } from '@easy-sysml/protocol';

const range: Range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

beforeEach(() => {
  resetAnonymousCounter();
});

function buildTree(): { root: ASTNode; defNode: ASTNode; usageNode: ASTNode; commentNode: ASTNode } {
  const root = createPackage('Vehicle', range);
  const defNode = createDefinition(SysMLElementKind.PartDefinition, 'Engine', range);
  const usageNode = createUsage(SysMLElementKind.PartUsage, 'engine', range);
  const commentNode = createComment('a comment', range);

  addChild(root, defNode);
  addChild(defNode, usageNode);
  addChild(root, commentNode);

  return { root, defNode, usageNode, commentNode };
}

describe('walk', () => {
  it('visits all nodes depth-first', () => {
    const { root } = buildTree();
    const visited: string[] = [];
    walk(root, {
      visitNode(n: ASTNode) {
        visited.push(n.name ?? '(anon)');
      },
    });
    expect(visited).toEqual(['Vehicle', 'Engine', 'engine', '(anon)']);
  });

  it('calls type-specific visitors', () => {
    const { root } = buildTree();
    const packages: string[] = [];
    const definitions: string[] = [];
    walk(root, {
      visitPackage(n) {
        packages.push(n.name!);
      },
      visitDefinition(n) {
        definitions.push(n.name!);
      },
    });
    expect(packages).toEqual(['Vehicle']);
    expect(definitions).toEqual(['Engine']);
  });
});

describe('walkUp', () => {
  it('visits from a leaf up to the root', () => {
    const { usageNode } = buildTree();
    const visited: string[] = [];
    walkUp(usageNode, {
      visitNode(n: ASTNode) {
        visited.push(n.name ?? '(anon)');
      },
    });
    expect(visited).toEqual(['engine', 'Engine', 'Vehicle']);
  });
});

describe('findNode', () => {
  it('finds a node by name', () => {
    const { root } = buildTree();
    const found = findNode(root, (n) => n.name === 'engine');
    expect(found).toBeDefined();
    expect(found!.name).toBe('engine');
  });

  it('returns undefined when not found', () => {
    const { root } = buildTree();
    const found = findNode(root, (n) => n.name === 'nonexistent');
    expect(found).toBeUndefined();
  });

  it('returns the root itself if it matches', () => {
    const { root } = buildTree();
    const found = findNode(root, (n) => n.name === 'Vehicle');
    expect(found).toBe(root);
  });
});

describe('findAllNodes', () => {
  it('finds all nodes matching a predicate', () => {
    const { root } = buildTree();
    const nodes = findAllNodes(root, (n) => n.name !== undefined);
    const names = nodes.map((n) => n.name);
    expect(names).toEqual(['Vehicle', 'Engine', 'engine']);
  });
});

describe('getAncestors', () => {
  it('returns ancestors from parent to root', () => {
    const { usageNode, defNode, root } = buildTree();
    const ancestors = getAncestors(usageNode);
    expect(ancestors).toEqual([defNode, root]);
  });

  it('returns empty array for root node', () => {
    const { root } = buildTree();
    expect(getAncestors(root)).toEqual([]);
  });
});

describe('getDepth', () => {
  it('returns 0 for root', () => {
    const { root } = buildTree();
    expect(getDepth(root)).toBe(0);
  });

  it('returns correct depth for nested nodes', () => {
    const { defNode, usageNode } = buildTree();
    expect(getDepth(defNode)).toBe(1);
    expect(getDepth(usageNode)).toBe(2);
  });
});

describe('mapNodes', () => {
  it('maps over all nodes and returns results', () => {
    const { root } = buildTree();
    const kinds = mapNodes(root, (n) => n.kind);
    expect(kinds).toHaveLength(4);
    expect(kinds[0]).toBe(SysMLElementKind.Package);
  });
});
