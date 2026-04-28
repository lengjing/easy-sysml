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

/** Project metadata (stored in the projects registry). */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/*  IndexedDB helpers                                                 */
/* ------------------------------------------------------------------ */

const DB_NAME = 'easy-sysml-workspace';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';

/** Key under which the active project id is stored. */
const ACTIVE_PROJECT_KEY = '__active_project__';
/** Key under which the project list is stored. */
const PROJECTS_LIST_KEY = '__projects__';
/** Workspace data key for a project: `workspace:{id}`. */
function workspaceKey(projectId: string): string {
  return `workspace:${projectId}`;
}
/** Legacy key kept for backwards compatibility. */
const LEGACY_WORKSPACE_KEY = 'current';

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

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ------------------------------------------------------------------ */
/*  Project registry helpers                                          */
/* ------------------------------------------------------------------ */

/** Generate a unique project id using the Web Crypto API. */
function generateProjectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `p-${crypto.randomUUID()}`;
  }
  // Fallback for environments without crypto.randomUUID
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Load the list of all projects. */
export async function loadProjectList(): Promise<ProjectMeta[]> {
  try {
    const list = await idbGet<ProjectMeta[]>(PROJECTS_LIST_KEY);
    if (list && list.length > 0) return list;
    // No projects yet — create the default one from the legacy workspace
    const defaultProject = await _createDefaultProject();
    return [defaultProject];
  } catch {
    return [];
  }
}

/** Save the project list. */
async function saveProjectList(list: ProjectMeta[]): Promise<void> {
  await idbSet(PROJECTS_LIST_KEY, list);
}

/** Create a brand new project and persist it. Returns the new project. */
export async function createNewProject(name: string, defaultContent?: FileNode[]): Promise<ProjectMeta> {
  const now = Date.now();
  const project: ProjectMeta = { id: generateProjectId(), name, createdAt: now, updatedAt: now };
  const nodes = defaultContent ?? createDefaultWorkspace(name);
  await idbSet(workspaceKey(project.id), { version: 1, nodes } as WorkspaceData);
  const list = await loadProjectList();
  await saveProjectList([...list, project]);
  return project;
}

/** Delete a project and its workspace. Returns the updated project list. */
export async function deleteProject(projectId: string): Promise<ProjectMeta[]> {
  try { await idbDelete(workspaceKey(projectId)); } catch { /* best-effort */ }
  const list = await loadProjectList();
  const updated = list.filter(p => p.id !== projectId);
  await saveProjectList(updated);
  return updated;
}

/** Get the currently active project id. */
export async function getActiveProjectId(): Promise<string | undefined> {
  try { return await idbGet<string>(ACTIVE_PROJECT_KEY); } catch { return undefined; }
}

/** Persist the active project id. */
export async function setActiveProjectId(id: string): Promise<void> {
  await idbSet(ACTIVE_PROJECT_KEY, id);
}

/**
 * Bootstrap: create the default project, migrating legacy 'current' workspace
 * if it exists, otherwise generating fresh default content.
 */
async function _createDefaultProject(): Promise<ProjectMeta> {
  const now = Date.now();
  const project: ProjectMeta = {
    id: generateProjectId(),
    name: '无人机系统架构项目 (UAV System)',
    createdAt: now,
    updatedAt: now,
  };
  try {
    const legacy = await idbGet<WorkspaceData>(LEGACY_WORKSPACE_KEY);
    if (legacy && legacy.nodes.length > 0) {
      await idbSet(workspaceKey(project.id), legacy);
      await saveProjectList([project]);
      await setActiveProjectId(project.id);
      return project;
    }
  } catch { /* ignore */ }
  const nodes = createDefaultWorkspace(project.name);
  await idbSet(workspaceKey(project.id), { version: 1, nodes } as WorkspaceData);
  await saveProjectList([project]);
  await setActiveProjectId(project.id);
  return project;
}

/* ------------------------------------------------------------------ */
/*  Default workspace                                                 */
/* ------------------------------------------------------------------ */

let _idCounter = 0;

export function generateId(): string {
  return `f-${Date.now()}-${++_idCounter}`;
}

/** Maximum characters to use from a project name as a folder name. */
const MAX_FOLDER_NAME_LENGTH = 30;

export function createDefaultWorkspace(projectName?: string): FileNode[] {
  const now = Date.now();
  const rootId = generateId();
  const mainId = generateId();
  const subsystemId = generateId();
  const folderName = projectName
    ? projectName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, MAX_FOLDER_NAME_LENGTH)
    : 'UAV_System';

  return [
    {
      id: rootId,
      name: folderName,
      type: 'directory',
      parentId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: mainId,
      name: 'main.sysml',
      type: 'file',
      parentId: rootId,
      content: `package UAV_System {
    part def Control_Subsystem {
        doc /* Executes complex flight control algorithms. */
        attribute frequency : String;
    }
    part def Power_Subsystem {
        doc /* Provides regulated power to all avionics. */
        attribute voltage : String;
    }
}`,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: subsystemId,
      name: 'subsystems.sysml',
      type: 'file',
      parentId: rootId,
      content: `package Subsystems {
    part def Navigation_Subsystem {
        doc /* GPS and INS based navigation module. */
        attribute accuracy : String;
    }
    part def Communication_Subsystem {
        doc /* Data link for telemetry and commands. */
        attribute bandwidth : String;
    }
}`,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  VirtualFileSystem class                                           */
/* ------------------------------------------------------------------ */

export class VirtualFileSystem {
  private nodes: Map<string, FileNode> = new Map();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<() => void> = new Set();
  private currentProjectId: string | null = null;

  /** Load workspace from IndexedDB for the given project (or create defaults). */
  async load(projectId?: string): Promise<void> {
    this.currentProjectId = projectId ?? null;
    const key = projectId ? workspaceKey(projectId) : LEGACY_WORKSPACE_KEY;
    try {
      const data = await idbGet<WorkspaceData>(key);
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
      const key = this.currentProjectId
        ? workspaceKey(this.currentProjectId)
        : LEGACY_WORKSPACE_KEY;
      const data: WorkspaceData = {
        version: 1,
        nodes: Array.from(this.nodes.values()),
      };
      await idbSet(key, data);
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

/**
 * Reset the singleton and load a new project workspace.
 * All existing subscribers are notified after the reload.
 */
export async function switchProjectWorkspace(projectId: string): Promise<void> {
  const fs = getFileSystem();
  await fs.load(projectId);
  await setActiveProjectId(projectId);
}
