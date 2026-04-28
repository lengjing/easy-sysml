/**
 * Hook: useFileSystem
 *
 * React hook that wraps the VirtualFileSystem singleton,
 * providing reactive state for the file tree and open tabs.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getFileSystem,
  type FileNode,
  type VirtualFileSystem,
} from '../lib/virtual-fs';
import {
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
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

const REMOTE_SAVE_DELAY_MS = 400;

function buildDirectoryId(path: string): string {
  return `dir:${path}`;
}

function buildNodesFromRemoteFiles(files: ServerFileRecord[]): FileNode[] {
  const directories = new Map<string, FileNode>();
  const nodes: FileNode[] = [];

  const ensureDirectory = (pathSegments: string[]): string | null => {
    if (pathSegments.length === 0) {
      return null;
    }

    const path = pathSegments.join('/');
    const existing = directories.get(path);
    if (existing) {
      return existing.id;
    }

    const parentId = ensureDirectory(pathSegments.slice(0, -1));
    const directory: FileNode = {
      id: buildDirectoryId(path),
      name: pathSegments[pathSegments.length - 1],
      type: 'directory',
      parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    directories.set(path, directory);
    return directory.id;
  };

  for (const file of files) {
    const pathSegments = file.path.split('/').filter(Boolean);
    const fileName = pathSegments[pathSegments.length - 1] ?? file.name;
    const parentId = ensureDirectory(pathSegments.slice(0, -1));

    nodes.push({
      id: file.id,
      remoteId: file.id,
      remotePath: file.path,
      name: fileName,
      type: 'file',
      parentId,
      content: file.content,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
    });
  }

  return [...directories.values(), ...nodes];
}

function collectDescendantFileIds(fs: VirtualFileSystem, rootId: string): string[] {
  const root = fs.getNode(rootId);
  if (!root) {
    return [];
  }
  if (root.type === 'file') {
    return [root.id];
  }

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

  const scheduleRemoteSave = useCallback((fileId: string) => {
    if (!projectId) {
      markTabDirty(fileId, false);
      return;
    }

    const existingTimer = saveTimersRef.current.get(fileId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      saveTimersRef.current.delete(fileId);
      const node = fs.getNode(fileId);
      if (!node || node.type !== 'file' || !node.remoteId) {
        return;
      }

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
  }, [fs, markTabDirty, projectId]);

  /* -- Initial load -- */
  useEffect(() => {
    let mounted = true;
    setReady(false);
    setOpenTabs([]);
    setActiveFileId(null);

    const loadFiles = async () => {
      try {
        if (projectId) {
          const remoteFiles = await listProjectFiles(projectId);
          fs.replaceAll(buildNodesFromRemoteFiles(remoteFiles));
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
        if (mounted) {
          setReady(true);
        }
      }
    };

    void loadFiles();

    return () => {
      mounted = false;
    };
  }, [fs, projectId]);

  useEffect(() => {
    return () => {
      for (const timer of saveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      saveTimersRef.current.clear();
    };
  }, []);

  /* -- Subscribe to VFS changes -- */
  useEffect(() => {
    return fs.subscribe(() => {
      setNodes(fs.getAllNodes());
    });
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
      // Select an adjacent tab from the updated list
      return remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].fileId : null;
    });
  }, []);

  const updateFileContent = useCallback((fileId: string, content: string) => {
    fs.updateContent(fileId, content);
    markTabDirty(fileId, true);
    scheduleRemoteSave(fileId);
  }, [fs, markTabDirty, scheduleRemoteSave]);

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
            scheduleRemoteSave(node.id);
          })
          .catch(error => {
            console.error('[easy-sysml] Failed to create file:', error);
            fs.patchNode(node.id, { isPending: false });
          });
      }

      return node;
    },
    [fs, projectId, scheduleRemoteSave],
  );

  const createDirectory = useCallback(
    (name: string, parentId: string | null) => {
      return fs.createDirectory(name, parentId);
    },
    [fs],
  );

  const renameNode = useCallback(
    (id: string, newName: string) => {
      fs.rename(id, newName);
      for (const fileId of collectDescendantFileIds(fs, id)) {
        scheduleRemoteSave(fileId);
      }
    },
    [fs, scheduleRemoteSave],
  );

  const deleteNode = useCallback(
    (id: string) => {
      const fileIds = collectDescendantFileIds(fs, id);
      const remoteFileIds = fileIds
        .map(fileId => fs.getNode(fileId))
        .filter((node): node is FileNode => Boolean(node && node.type === 'file'))
        .map(node => node.remoteId)
        .filter((remoteId): remoteId is string => Boolean(remoteId));

      // Close any tabs for files being deleted
      const toClose = new Set<string>();
      const collect = (nodeId: string) => {
        toClose.add(nodeId);
        fs.getChildren(nodeId).forEach(child => collect(child.id));
      };
      collect(id);

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
        for (const remoteFileId of remoteFileIds) {
          void deleteProjectFile(projectId, remoteFileId).catch(error => {
            console.error('[easy-sysml] Failed to delete file:', error);
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

  const getPath = useCallback(
    (id: string) => fs.getPath(id),
    [fs],
  );

  const getUri = useCallback(
    (id: string) => fs.getUri(id),
    [fs],
  );

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
