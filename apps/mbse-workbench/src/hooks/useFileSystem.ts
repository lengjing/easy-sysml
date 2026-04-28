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

export function useFileSystem(projectId?: string | null): UseFileSystemReturn {
  const fsRef = useRef(getFileSystem());
  const fs = fsRef.current;

  const [ready, setReady] = useState(false);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  /* -- Initial load / project switch -- */
  useEffect(() => {
    let mounted = true;
    setReady(false);
    setOpenTabs([]);
    setActiveFileId(null);
    fs.load(projectId ?? undefined).then(() => {
      if (!mounted) return;
      setNodes(fs.getAllNodes());
      // Auto-open the first file
      const files = fs.getAllFiles();
      if (files.length > 0) {
        const first = files[0];
        setOpenTabs([{ fileId: first.id, dirty: false }]);
        setActiveFileId(first.id);
      }
      setReady(true);
    });
    return () => { mounted = false; };
  }, [fs, projectId]);

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
    setOpenTabs(prev =>
      prev.map(t => (t.fileId === fileId ? { ...t, dirty: false } : t)),
    );
  }, [fs]);

  const createFile = useCallback(
    (name: string, parentId: string | null, content: string = '') => {
      const node = fs.createFile(name, parentId, content);
      // Auto-open the new file
      setOpenTabs(prev => [...prev, { fileId: node.id, dirty: false }]);
      setActiveFileId(node.id);
      return node;
    },
    [fs],
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
    },
    [fs],
  );

  const deleteNode = useCallback(
    (id: string) => {
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
    },
    [fs],
  );

  const moveNode = useCallback(
    (id: string, newParentId: string | null) => {
      fs.move(id, newParentId);
    },
    [fs],
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
