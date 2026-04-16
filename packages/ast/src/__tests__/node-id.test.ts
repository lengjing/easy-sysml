import { describe, it, expect } from 'vitest';
import { generateNodeId, parseNodeId, isDescendantOf } from '../node-id.js';
import type { NodeId } from '../node-id.js';

describe('generateNodeId', () => {
  it('creates a root-level id when parent is null', () => {
    const id = generateNodeId(null, 'pkg', 'Vehicle');
    expect(id).toBe('pkg:Vehicle');
  });

  it('creates a nested id from a parent', () => {
    const parent = generateNodeId(null, 'pkg', 'Vehicle');
    const child = generateNodeId(parent, 'part', 'engine');
    expect(child).toBe('pkg:Vehicle/part:engine');
  });

  it('creates deeply nested ids', () => {
    const root = generateNodeId(null, 'pkg', 'Vehicle');
    const mid = generateNodeId(root, 'part', 'engine');
    const leaf = generateNodeId(mid, 'attr', 'displacement');
    expect(leaf).toBe('pkg:Vehicle/part:engine/attr:displacement');
  });

  it('is deterministic – same inputs produce same output', () => {
    const a = generateNodeId(null, 'pkg', 'A');
    const b = generateNodeId(null, 'pkg', 'A');
    expect(a).toBe(b);
  });

  it('encodes special characters in names', () => {
    const id = generateNodeId(null, 'pkg', 'a/b:c');
    expect(id).not.toContain('/b');
    const parsed = parseNodeId(id);
    expect(parsed.segments[0].name).toBe('a/b:c');
  });
});

describe('parseNodeId', () => {
  it('parses a single-segment id', () => {
    const id = generateNodeId(null, 'pkg', 'Root');
    const { segments } = parseNodeId(id);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ kind: 'pkg', name: 'Root' });
  });

  it('parses a multi-segment id', () => {
    const root = generateNodeId(null, 'pkg', 'Vehicle');
    const child = generateNodeId(root, 'part', 'engine');
    const { segments } = parseNodeId(child);
    expect(segments).toEqual([
      { kind: 'pkg', name: 'Vehicle' },
      { kind: 'part', name: 'engine' },
    ]);
  });

  it('returns empty segments for empty string', () => {
    const { segments } = parseNodeId('' as NodeId);
    expect(segments).toEqual([]);
  });
});

describe('isDescendantOf', () => {
  it('returns true for a direct child', () => {
    const parent = generateNodeId(null, 'pkg', 'Vehicle');
    const child = generateNodeId(parent, 'part', 'engine');
    expect(isDescendantOf(child, parent)).toBe(true);
  });

  it('returns true for a deep descendant', () => {
    const root = generateNodeId(null, 'pkg', 'Vehicle');
    const mid = generateNodeId(root, 'part', 'engine');
    const leaf = generateNodeId(mid, 'attr', 'displacement');
    expect(isDescendantOf(leaf, root)).toBe(true);
  });

  it('returns false for the same node', () => {
    const id = generateNodeId(null, 'pkg', 'Vehicle');
    expect(isDescendantOf(id, id)).toBe(false);
  });

  it('returns false for unrelated nodes', () => {
    const a = generateNodeId(null, 'pkg', 'A');
    const b = generateNodeId(null, 'pkg', 'B');
    expect(isDescendantOf(a, b)).toBe(false);
  });

  it('returns false for ancestor-to-descendant direction', () => {
    const parent = generateNodeId(null, 'pkg', 'Vehicle');
    const child = generateNodeId(parent, 'part', 'engine');
    expect(isDescendantOf(parent, child)).toBe(false);
  });
});
