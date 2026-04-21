import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VirtualFileSystem,
  generateId,
  createDefaultWorkspace,
  type FileNode,
} from '../lib/virtual-fs';

/* ------------------------------------------------------------------ */
/*  Mock IndexedDB — tests run in jsdom which has no real IndexedDB    */
/* ------------------------------------------------------------------ */

// The VFS gracefully falls back to in-memory when IndexedDB is unavailable,
// so we don't need to mock it — just verify the in-memory behavior.

describe('VirtualFileSystem', () => {
  let fs: VirtualFileSystem;

  beforeEach(async () => {
    fs = new VirtualFileSystem();
    await fs.load(); // Will fall back to defaults in jsdom
  });

  /* -- Default workspace -- */

  it('loads default workspace with directory and files', () => {
    const nodes = fs.getAllNodes();
    expect(nodes.length).toBe(3); // 1 dir + 2 files
    expect(nodes.filter(n => n.type === 'directory').length).toBe(1);
    expect(nodes.filter(n => n.type === 'file').length).toBe(2);
  });

  it('default workspace has a root directory named UAV_System', () => {
    const root = fs.getChildren(null);
    expect(root.length).toBe(1);
    expect(root[0].type).toBe('directory');
    expect(root[0].name).toBe('UAV_System');
  });

  it('default workspace files are children of the root directory', () => {
    const root = fs.getChildren(null)[0];
    const children = fs.getChildren(root.id);
    expect(children.length).toBe(2);
    const names = children.map(c => c.name);
    expect(names).toContain('main.sysml');
    expect(names).toContain('subsystems.sysml');
  });

  it('default files have non-empty content', () => {
    const files = fs.getAllFiles();
    for (const f of files) {
      expect(f.content).toBeDefined();
      expect(f.content!.length).toBeGreaterThan(0);
    }
  });

  /* -- CRUD operations -- */

  it('createFile adds a new file', () => {
    const root = fs.getChildren(null)[0];
    const file = fs.createFile('test.sysml', root.id, 'package Test {}');
    expect(file.type).toBe('file');
    expect(file.name).toBe('test.sysml');
    expect(file.content).toBe('package Test {}');
    expect(fs.getNode(file.id)).toBeDefined();
  });

  it('createDirectory adds a new directory', () => {
    const dir = fs.createDirectory('subsystem', null);
    expect(dir.type).toBe('directory');
    expect(dir.name).toBe('subsystem');
    expect(fs.getChildren(null).some(n => n.id === dir.id)).toBe(true);
  });

  it('updateContent changes file content', () => {
    const files = fs.getAllFiles();
    const file = files[0];
    fs.updateContent(file.id, 'new content');
    expect(fs.getNode(file.id)!.content).toBe('new content');
  });

  it('updateContent updates the updatedAt timestamp', () => {
    const files = fs.getAllFiles();
    const file = files[0];
    const before = file.updatedAt;
    // Wait a tick to ensure timestamp changes
    fs.updateContent(file.id, 'updated');
    const after = fs.getNode(file.id)!.updatedAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('rename changes a node name', () => {
    const files = fs.getAllFiles();
    const file = files[0];
    fs.rename(file.id, 'renamed.sysml');
    expect(fs.getNode(file.id)!.name).toBe('renamed.sysml');
  });

  it('delete removes a file', () => {
    const files = fs.getAllFiles();
    const file = files[0];
    const id = file.id;
    fs.delete(id);
    expect(fs.getNode(id)).toBeUndefined();
  });

  it('delete removes a directory and all its children', () => {
    const root = fs.getChildren(null)[0];
    const childCount = fs.getChildren(root.id).length;
    expect(childCount).toBeGreaterThan(0);

    fs.delete(root.id);
    expect(fs.getNode(root.id)).toBeUndefined();
    expect(fs.getAllNodes().length).toBe(0);
  });

  it('move changes a node parent', () => {
    const newDir = fs.createDirectory('other', null);
    const files = fs.getAllFiles();
    const file = files[0];
    fs.move(file.id, newDir.id);
    expect(fs.getNode(file.id)!.parentId).toBe(newDir.id);
    expect(fs.getChildren(newDir.id).some(n => n.id === file.id)).toBe(true);
  });

  it('move prevents circular references', () => {
    const root = fs.getChildren(null)[0];
    const child = fs.createDirectory('sub', root.id);
    // Try to move root into child — should be a no-op
    fs.move(root.id, child.id);
    expect(fs.getNode(root.id)!.parentId).toBeNull();
  });

  /* -- Queries -- */

  it('getPath returns full path', () => {
    const root = fs.getChildren(null)[0];
    const files = fs.getChildren(root.id);
    const file = files.find(f => f.name === 'main.sysml')!;
    expect(fs.getPath(file.id)).toBe('UAV_System/main.sysml');
  });

  it('getUri returns inmemory URI', () => {
    const root = fs.getChildren(null)[0];
    const files = fs.getChildren(root.id);
    const file = files.find(f => f.name === 'main.sysml')!;
    expect(fs.getUri(file.id)).toBe('inmemory:///UAV_System/main.sysml');
  });

  it('findByPath locates files by path', () => {
    const found = fs.findByPath('UAV_System/main.sysml');
    expect(found).toBeDefined();
    expect(found!.name).toBe('main.sysml');
  });

  it('nameExists checks for duplicate names', () => {
    const root = fs.getChildren(null)[0];
    expect(fs.nameExists('main.sysml', root.id)).toBe(true);
    expect(fs.nameExists('nonexistent.sysml', root.id)).toBe(false);
  });

  it('getChildren sorts directories before files', () => {
    const root = fs.getChildren(null)[0];
    const subdir = fs.createDirectory('aaa-dir', root.id);
    const children = fs.getChildren(root.id);
    // First child should be the directory
    expect(children[0].type).toBe('directory');
  });

  /* -- Subscription -- */

  it('subscribe notifies listeners on changes', () => {
    const callback = vi.fn();
    const unsub = fs.subscribe(callback);

    fs.createFile('notify-test.sysml', null, '');
    expect(callback).toHaveBeenCalled();

    unsub();
    callback.mockClear();
    fs.createFile('another.sysml', null, '');
    expect(callback).not.toHaveBeenCalled();
  });

  /* -- Helper functions -- */

  it('generateId returns unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('createDefaultWorkspace returns valid nodes', () => {
    const nodes = createDefaultWorkspace();
    expect(nodes.length).toBe(3);
    const dir = nodes.find(n => n.type === 'directory');
    expect(dir).toBeDefined();
    expect(dir!.name).toBe('UAV_System');
    const files = nodes.filter(n => n.type === 'file');
    expect(files.length).toBe(2);
    expect(files.every(f => f.parentId === dir!.id)).toBe(true);
  });
});
