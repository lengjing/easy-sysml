/**
 * Virtual File System with IndexedDB Persistence
 *
 * Provides an in-memory file tree that auto-persists to IndexedDB.
 * Each file is a SysML v2 source file (.sysml) stored as a string.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface FileNode {
  /** Unique stable identifier. */
  id: string;
  /** Display name (e.g. "model.sysml"). */
  name: string;
  /** 'file' or 'directory'. */
  type: 'file' | 'directory';
  /** Parent directory id, or null for root-level entries. */
  parentId: string | null;
  /** File content (only for type === 'file'). */
  content?: string;
  /** Creation timestamp. */
  createdAt: number;
  /** Last modification timestamp. */
  updatedAt: number;
}

/** Serialised workspace stored in IndexedDB. */
export interface WorkspaceData {
  /** Schema version for future migrations. */
  version: number;
  /** Flat array of all nodes. */
  nodes: FileNode[];
}

/* ------------------------------------------------------------------ */
/*  IndexedDB helpers                                                 */
/* ------------------------------------------------------------------ */

const DB_NAME = 'easy-sysml-workspace';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const WORKSPACE_KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ------------------------------------------------------------------ */
/*  Default workspace                                                 */
/* ------------------------------------------------------------------ */

let _idCounter = 0;

export function generateId(): string {
  return `f-${Date.now()}-${++_idCounter}`;
}

export function createDefaultWorkspace(): FileNode[] {
  return [];
}

/* ------------------------------------------------------------------ */
/*  VirtualFileSystem class                                           */
/* ------------------------------------------------------------------ */

export class VirtualFileSystem {
  private nodes: Map<string, FileNode> = new Map();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();

  /** Load workspace from IndexedDB (or create defaults). */
  async load(): Promise<void> {
    try {
      const data = await idbGet<WorkspaceData>(WORKSPACE_KEY);
      if (data && data.nodes.length > 0) {
        this.nodes.clear();
        for (const node of data.nodes) {
          this.nodes.set(node.id, node);
        }
      } else {
        this.initDefaults();
      }
    } catch {
      // IndexedDB unavailable (e.g. SSR or private browsing) — use defaults
      this.initDefaults();
    }
    this.notify();
  }

  private initDefaults(): void {
    this.nodes.clear();
    for (const node of createDefaultWorkspace()) {
      this.nodes.set(node.id, node);
    }
  }

  /** Persist to IndexedDB (debounced). */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.persistNow();
    }, 300);
  }

  /** Immediately persist the current state. */
  async persistNow(): Promise<void> {
    try {
      const data: WorkspaceData = {
        version: 1,
        nodes: Array.from(this.nodes.values()),
      };
      await idbSet(WORKSPACE_KEY, data);
    } catch {
      // Persist is best-effort
    }
  }

  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  /* -- Queries -- */

  /** Get all nodes as an array (snapshot). */
  getAllNodes(): FileNode[] {
    return Array.from(this.nodes.values());
  }

  /** Get a single node by id. */
  getNode(id: string): FileNode | undefined {
    return this.nodes.get(id);
  }

  /** Get children of a given parent (null = root level). */
  getChildren(parentId: string | null): FileNode[] {
    const result: FileNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.parentId === parentId) {
        result.push(node);
      }
    }
    // Sort: directories first, then alphabetical
    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  /** Get all files (not directories). */
  getAllFiles(): FileNode[] {
    return this.getAllNodes().filter(n => n.type === 'file');
  }

  /** Build the full path for a node (e.g. "UAV_System/main.sysml"). */
  getPath(id: string): string {
    const parts: string[] = [];
    let current = this.nodes.get(id);
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? this.nodes.get(current.parentId) : undefined;
    }
    return parts.join('/');
  }

  /** Build the inmemory URI for a file node. */
  getUri(id: string): string {
    return `inmemory:///${this.getPath(id)}`;
  }

  /** Find a file by its path. */
  findByPath(path: string): FileNode | undefined {
    for (const node of this.nodes.values()) {
      if (this.getPath(node.id) === path) {
        return node;
      }
    }
    return undefined;
  }

  /* -- Mutations -- */

  /** Create a new file. */
  createFile(name: string, parentId: string | null, content: string = ''): FileNode {
    const now = Date.now();
    const node: FileNode = {
      id: generateId(),
      name,
      type: 'file',
      parentId,
      content,
      createdAt: now,
      updatedAt: now,
    };
    this.nodes.set(node.id, node);
    this.scheduleSave();
    this.notify();
    return node;
  }

  /** Create a new directory. */
  createDirectory(name: string, parentId: string | null): FileNode {
    const now = Date.now();
    const node: FileNode = {
      id: generateId(),
      name,
      type: 'directory',
      parentId,
      createdAt: now,
      updatedAt: now,
    };
    this.nodes.set(node.id, node);
    this.scheduleSave();
    this.notify();
    return node;
  }

  /** Update file content. */
  updateContent(id: string, content: string): void {
    const node = this.nodes.get(id);
    if (!node || node.type !== 'file') return;
    node.content = content;
    node.updatedAt = Date.now();
    this.scheduleSave();
    this.notify();
  }

  /** Rename a node. */
  rename(id: string, newName: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.name = newName;
    node.updatedAt = Date.now();
    this.scheduleSave();
    this.notify();
  }

  /** Delete a node (and all children if it's a directory). */
  delete(id: string): void {
    const toDelete = new Set<string>();
    const collect = (nodeId: string) => {
      toDelete.add(nodeId);
      // Collect children recursively
      for (const node of this.nodes.values()) {
        if (node.parentId === nodeId) {
          collect(node.id);
        }
      }
    };
    collect(id);
    for (const delId of toDelete) {
      this.nodes.delete(delId);
    }
    this.scheduleSave();
    this.notify();
  }

  /** Move a node to a new parent. */
  move(id: string, newParentId: string | null): void {
    const node = this.nodes.get(id);
    if (!node) return;
    // Prevent moving into self or a descendant
    if (newParentId !== null) {
      let check = this.nodes.get(newParentId);
      while (check) {
        if (check.id === id) return; // would create a cycle
        check = check.parentId ? this.nodes.get(check.parentId) : undefined;
      }
    }
    node.parentId = newParentId;
    node.updatedAt = Date.now();
    this.scheduleSave();
    this.notify();
  }

  /** Check if a name already exists among siblings. */
  nameExists(name: string, parentId: string | null, excludeId?: string): boolean {
    for (const node of this.nodes.values()) {
      if (node.parentId === parentId && node.name === name && node.id !== excludeId) {
        return true;
      }
    }
    return false;
  }
}

/** Singleton instance. */
let _instance: VirtualFileSystem | undefined;

export function getFileSystem(): VirtualFileSystem {
  if (!_instance) {
    _instance = new VirtualFileSystem();
  }
  return _instance;
}
