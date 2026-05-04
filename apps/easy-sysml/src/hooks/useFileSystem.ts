/**
 * Hook: useFileSystem
 *
 * React hook that wraps the VirtualFileSystem singleton,
 * providing reactive state for the file tree and open tabs.
 *
 * When a `projectId` is provided the file tree is loaded from the backend
 * and all mutations (create, update, rename, delete) are synced back.
 * Without a `projectId` the hook falls back to local IndexedDB storage.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getFileSystem,
  type FileNode,
  type VirtualFileSystem,
} from '../lib/virtual-fs';
import {
  createProjectDirectory,
  createProjectFile,
  deleteProjectFile,
  listProjectFiles,
  updateProjectFile,
  type ServerFileRecord,
} from '../lib/sysml-server';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface OpenTab {
  /** File id. */
  fileId: string;
  /** Whether the file has unsaved changes relative to VFS. */
  dirty: boolean;
}

export interface UseFileSystemReturn {
  /** Whether the initial load is complete. */
  ready: boolean;
  /** All file nodes (flat). */
  nodes: FileNode[];
  /** Currently open tabs. */
  openTabs: OpenTab[];
  /** The active (focused) tab's file id, or null. */
  activeFileId: string | null;
  /** Content of the active file. */
  activeFileContent: string;
  /** The active file node. */
  activeFile: FileNode | undefined;

  /* Actions */
  openFile: (fileId: string) => void;
  closeTab: (fileId: string) => void;
  setActiveFile: (fileId: string) => void;
  updateFileContent: (fileId: string, content: string) => void;
  createFile: (name: string, parentId: string | null, content?: string) => FileNode;
  createDirectory: (name: string, parentId: string | null) => FileNode;
  renameNode: (id: string, newName: string) => void;
  deleteNode: (id: string) => void;
  moveNode: (id: string, newParentId: string | null) => void;
  getChildren: (parentId: string | null) => FileNode[];
  getPath: (id: string) => string;
  getUri: (id: string) => string;
  fs: VirtualFileSystem;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const REMOTE_SAVE_DELAY_MS = 400;

/**
 * Build VFS nodes from the server filesystem response.
 *
 * The server returns both files and directories. Each node already has
 * an `id` (base64url of its path) and a `type` field, so we don't need
 * to infer directory structure from file paths anymore.
 */
function buildNodesFromServerResponse(records: ServerFileRecord[]): FileNode[] {
  // Build a path→id map for parent resolution (directories first)
  const pathToId = new Map<string, string>();
  for (const record of records) {
    if (record.type === 'directory') {
      pathToId.set(record.path, record.id);
    }
  }

  return records.map(record => {
    const segments = record.path.split('/').filter(Boolean);
    const parentPath = segments.slice(0, -1).join('/');
    const parentId = parentPath ? (pathToId.get(parentPath) ?? null) : null;

    const node: FileNode = {
      id: record.id,
      remoteId: record.id,
      remotePath: record.path,
      name: record.name,
      type: record.type,
      parentId,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
    if (record.type === 'file') {
      node.content = record.content ?? '';
    }
    return node;
  });
}

function collectDescendantFileIds(fs: VirtualFileSystem, rootId: string): string[] {
  const root = fs.getNode(rootId);
  if (!root) return [];
  if (root.type === 'file') return [root.id];

  const fileIds: string[] = [];
  const walk = (nodeId: string) => {
    for (const child of fs.getChildren(nodeId)) {
      if (child.type === 'file') {
        fileIds.push(child.id);
      } else {
        walk(child.id);
      }
    }
  };
  walk(rootId);
  return fileIds;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useFileSystem(projectId?: string): UseFileSystemReturn {
  const fsRef = useRef(getFileSystem());
  const fs = fsRef.current;
  const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [ready, setReady] = useState(false);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  const markTabDirty = useCallback((fileId: string, dirty: boolean) => {
    setOpenTabs(prev => prev.map(tab => (tab.fileId === fileId ? { ...tab, dirty } : tab)));
  }, []);

  /**
   * Schedule a debounced remote save for a file.
   * After saving, patches the local node with the server-returned ID
   * (which may have changed if the path changed).
   */
  const scheduleRemoteSave = useCallback(
    (fileId: string) => {
      if (!projectId) {
        markTabDirty(fileId, false);
        return;
      }

      const existing = saveTimersRef.current.get(fileId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        saveTimersRef.current.delete(fileId);
        const node = fs.getNode(fileId);
        if (!node || node.type !== 'file' || !node.remoteId) return;

        void updateProjectFile(projectId, node.remoteId, {
          name: node.name,
          path: fs.getPath(fileId),
          content: node.content ?? '',
        })
          .then(record => {
            fs.patchNode(fileId, {
              remoteId: record.id,
              remotePath: record.path,
              name: record.name,
              content: record.content,
              isPending: false,
            });
            markTabDirty(fileId, false);
          })
          .catch(error => {
            console.error('[easy-sysml] Failed to save file:', error);
          });
      }, REMOTE_SAVE_DELAY_MS);

      saveTimersRef.current.set(fileId, timer);
    },
    [fs, markTabDirty, projectId],
  );

  /* -- Initial load -- */
  useEffect(() => {
    let mounted = true;
    setReady(false);
    setOpenTabs([]);
    setActiveFileId(null);

    const loadFiles = async () => {
      try {
        if (projectId) {
          const remoteRecords = await listProjectFiles(projectId);
          fs.replaceAll(buildNodesFromServerResponse(remoteRecords));
        } else {
          await fs.load();
        }

        if (!mounted) return;

        setNodes(fs.getAllNodes());
        const files = fs.getAllFiles();
        if (files.length > 0) {
          const first = files[0];
          setOpenTabs([{ fileId: first.id, dirty: false }]);
          setActiveFileId(first.id);
        }
      } catch (error) {
        console.error('[easy-sysml] Failed to load files:', error);
        if (mounted) {
          fs.replaceAll([]);
          setNodes([]);
        }
      } finally {
        if (mounted) setReady(true);
      }
    };

    void loadFiles();
    return () => { mounted = false; };
  }, [fs, projectId]);

  /* -- Cleanup pending save timers on unmount -- */
  useEffect(() => {
    return () => {
      for (const timer of saveTimersRef.current.values()) clearTimeout(timer);
      saveTimersRef.current.clear();
    };
  }, []);

  /* -- Subscribe to VFS changes -- */
  useEffect(() => {
    return fs.subscribe(() => setNodes(fs.getAllNodes()));
  }, [fs]);

  /* -- Derived state -- */
  const activeFile = activeFileId ? fs.getNode(activeFileId) : undefined;
  const activeFileContent = activeFile?.content ?? '';

  /* -- Actions -- */

  const openFile = useCallback((fileId: string) => {
    setOpenTabs(prev => {
      if (prev.some(t => t.fileId === fileId)) return prev;
      return [...prev, { fileId, dirty: false }];
    });
    setActiveFileId(fileId);
  }, []);

  const closeTab = useCallback((fileId: string) => {
    let remainingTabs: OpenTab[] = [];
    setOpenTabs(prev => {
      remainingTabs = prev.filter(t => t.fileId !== fileId);
      return remainingTabs;
    });
    setActiveFileId(prev => {
      if (prev !== fileId) return prev;
      return remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].fileId : null;
    });
  }, []);

  const updateFileContent = useCallback(
    (fileId: string, content: string) => {
      fs.updateContent(fileId, content);
      markTabDirty(fileId, true);
      scheduleRemoteSave(fileId);
    },
    [fs, markTabDirty, scheduleRemoteSave],
  );

  const createFile = useCallback(
    (name: string, parentId: string | null, content: string = '') => {
      const node = fs.createFile(name, parentId, content);
      const path = fs.getPath(node.id);
      fs.patchNode(node.id, { remotePath: path, isPending: Boolean(projectId) });

      // Auto-open the new file
      setOpenTabs(prev => [...prev, { fileId: node.id, dirty: false }]);
      setActiveFileId(node.id);

      if (projectId) {
        void createProjectFile(projectId, { name, path, content })
          .then(record => {
            fs.patchNode(node.id, {
              remoteId: record.id,
              remotePath: record.path,
              name: record.name,
              content: record.content,
              isPending: false,
            });
          })
          .catch(error => {
            console.error('[easy-sysml] Failed to create file:', error);
            fs.patchNode(node.id, { isPending: false });
          });
      }

      return node;
    },
    [fs, projectId],
  );

  const createDirectory = useCallback(
    (name: string, parentId: string | null) => {
      const node = fs.createDirectory(name, parentId);
      const path = fs.getPath(node.id);

      if (projectId) {
        void createProjectDirectory(projectId, { name, path })
          .then(record => {
            fs.patchNode(node.id, {
              remoteId: record.id,
              remotePath: record.path,
            });
          })
          .catch(error => {
            console.error('[easy-sysml] Failed to create directory:', error);
          });
      }

      return node;
    },
    [fs, projectId],
  );

  const renameNode = useCallback(
    (id: string, newName: string) => {
      fs.rename(id, newName);

      const node = fs.getNode(id);
      if (projectId && node?.type === 'directory' && node.remoteId) {
        // For directories: rename on server, then force-save all descendant files
        // so their paths are updated too.
        void updateProjectFile(projectId, node.remoteId, { name: newName })
          .then(record => {
            fs.patchNode(id, { remoteId: record.id, remotePath: record.path });
            for (const fileId of collectDescendantFileIds(fs, id)) {
              scheduleRemoteSave(fileId);
            }
          })
          .catch(error => {
            console.error('[easy-sysml] Failed to rename directory:', error);
            for (const fileId of collectDescendantFileIds(fs, id)) {
              scheduleRemoteSave(fileId);
            }
          });
      } else {
        for (const fileId of collectDescendantFileIds(fs, id)) {
          scheduleRemoteSave(fileId);
        }
      }
    },
    [fs, projectId, scheduleRemoteSave],
  );

  const deleteNode = useCallback(
    (id: string) => {
      const node = fs.getNode(id);
      const fileIds = collectDescendantFileIds(fs, id);

      // Collect all remote IDs to delete (files and the root node if it's a dir)
      const remoteNodeIds: string[] = [];
      if (node?.remoteId) {
        // If it's a directory with a remoteId, we only need to delete the directory
        // (the server deletes recursively). Otherwise collect file IDs.
        if (node.type === 'directory') {
          remoteNodeIds.push(node.remoteId);
        } else {
          remoteNodeIds.push(node.remoteId);
        }
      } else {
        // Fallback: collect remote IDs of individual files
        for (const fileId of fileIds) {
          const fileNode = fs.getNode(fileId);
          if (fileNode?.remoteId) remoteNodeIds.push(fileNode.remoteId);
        }
      }

      // Close any open tabs for the deleted nodes
      const toClose = new Set<string>();
      const collectIds = (nodeId: string) => {
        toClose.add(nodeId);
        for (const child of fs.getChildren(nodeId)) collectIds(child.id);
      };
      collectIds(id);

      let remainingTabs: OpenTab[] = [];
      setOpenTabs(prev => {
        remainingTabs = prev.filter(t => !toClose.has(t.fileId));
        return remainingTabs;
      });
      setActiveFileId(prev => {
        if (prev && toClose.has(prev)) {
          return remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].fileId : null;
        }
        return prev;
      });

      fs.delete(id);

      for (const fileId of fileIds) {
        const timer = saveTimersRef.current.get(fileId);
        if (timer) {
          clearTimeout(timer);
          saveTimersRef.current.delete(fileId);
        }
      }

      if (projectId) {
        for (const remoteNodeId of remoteNodeIds) {
          void deleteProjectFile(projectId, remoteNodeId).catch(error => {
            console.error('[easy-sysml] Failed to delete node:', error);
          });
        }
      }
    },
    [fs, projectId],
  );

  const moveNode = useCallback(
    (id: string, newParentId: string | null) => {
      fs.move(id, newParentId);
      for (const fileId of collectDescendantFileIds(fs, id)) {
        scheduleRemoteSave(fileId);
      }
    },
    [fs, scheduleRemoteSave],
  );

  const getChildren = useCallback(
    (parentId: string | null) => fs.getChildren(parentId),
    [fs],
  );

  const getPath = useCallback((id: string) => fs.getPath(id), [fs]);

  const getUri = useCallback((id: string) => fs.getUri(id), [fs]);

  return {
    ready,
    nodes,
    openTabs,
    activeFileId,
    activeFileContent,
    activeFile,
    openFile,
    closeTab,
    setActiveFile: setActiveFileId,
    updateFileContent,
    createFile,
    createDirectory,
    renameNode,
    deleteNode,
    moveNode,
    getChildren,
    getPath,
    getUri,
    fs,
  };
}

