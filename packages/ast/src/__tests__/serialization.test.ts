import { describe, it, expect, beforeEach } from 'vitest';
import { SysMLElementKind } from '@easy-sysml/protocol';
import type { Range } from '@easy-sysml/protocol';
import { serialize, deserialize, toPlainObject, fromPlainObject } from '../serialization.js';
import {
  createPackage,
  createDefinition,
  createUsage,
  createComment,
  createLiteral,
  createImport,
  resetAnonymousCounter,
} from '../ast-factory.js';
import { addChild } from '../mutation.js';
import type { ASTNode, CommentNode, LiteralNode, ImportNode } from '../ast-node.js';

const range: Range = {
  start: { line: 0, character: 0 },
  end: { line: 1, character: 0 },
};

beforeEach(() => {
  resetAnonymousCounter();
});

function buildTree(): ASTNode {
  const root = createPackage('Vehicle', range);
  const def = createDefinition(SysMLElementKind.PartDefinition, 'Engine', range);
  const usage = createUsage(SysMLElementKind.PartUsage, 'engine', range);
  const comment = createComment('This is a comment', range);
  const literal = createLiteral(42, range);
  const imp = createImport('ISQ::*', range, false, true);

  addChild(root, def);
  addChild(def, usage);
  addChild(root, comment);
  addChild(root, literal);
  addChild(root, imp);

  return root;
}

describe('toPlainObject', () => {
  it('converts an AST node to a plain object', () => {
    const root = buildTree();
    const plain = toPlainObject(root);

    expect(plain.id).toBe(root.id);
    expect(plain.kind).toBe(SysMLElementKind.Package);
    expect(plain.name).toBe('Vehicle');
    expect(plain.children).toHaveLength(4);
  });

  it('does not include parent references (no circular refs)', () => {
    const root = buildTree();
    const json = JSON.stringify(toPlainObject(root));
    expect(json).not.toContain('"parent"');
  });

  it('preserves extra fields from subtypes', () => {
    const comment = createComment('hello', range);
    const plain = toPlainObject(comment);
    expect(plain.extra?.body).toBe('hello');
  });
});

describe('fromPlainObject', () => {
  it('reconstructs an AST node from a plain object', () => {
    const root = buildTree();
    const plain = toPlainObject(root);
    const restored = fromPlainObject(plain);

    expect(restored.id).toBe(root.id);
    expect(restored.kind).toBe(root.kind);
    expect(restored.children).toHaveLength(4);
  });

  it('restores parent links', () => {
    const root = buildTree();
    const plain = toPlainObject(root);
    const restored = fromPlainObject(plain);

    expect(restored.children[0].parent).toBe(restored);
    expect(restored.children[0].children[0].parent).toBe(restored.children[0]);
  });

  it('restores extra fields from subtypes', () => {
    const comment = createComment('hello', range);
    const plain = toPlainObject(comment);
    const restored = fromPlainObject(plain) as CommentNode;
    expect(restored.body).toBe('hello');
  });
});

describe('serialize / deserialize', () => {
  it('round-trips an AST tree', () => {
    const root = buildTree();
    const json = serialize(root);
    const restored = deserialize(json);

    expect(restored.id).toBe(root.id);
    expect(restored.name).toBe('Vehicle');
    expect(restored.children).toHaveLength(4);
    expect(restored.children[0].name).toBe('Engine');
    expect(restored.children[0].children[0].name).toBe('engine');
  });

  it('produces valid JSON', () => {
    const root = buildTree();
    const json = serialize(root);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('preserves literal values', () => {
    const literal = createLiteral(3.14, range);
    const json = serialize(literal);
    const restored = deserialize(json) as LiteralNode;
    expect(restored.value).toBe(3.14);
  });

  it('preserves import details', () => {
    const imp = createImport('Vehicles::*', range, true, true);
    const json = serialize(imp);
    const restored = deserialize(json) as ImportNode;
    expect(restored.importedNamespace).toBe('Vehicles::*');
    expect(restored.isRecursive).toBe(true);
    expect(restored.isWildcard).toBe(true);
  });

  it('handles trees with circular parent refs without throwing', () => {
    const root = buildTree();
    // The tree has parent references — serialize should handle them
    expect(() => serialize(root)).not.toThrow();
  });
});
