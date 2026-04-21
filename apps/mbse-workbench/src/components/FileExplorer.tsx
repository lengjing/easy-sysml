/**
 * FileExplorer — file tree with CRUD operations.
 *
 * Renders a recursive tree of the virtual file system. Supports:
 * - Click to open a file in the editor
 * - Context menu for new file / new folder / rename / delete
 * - Inline rename editing
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FolderOpen,
  Folder,
  FileCode,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import type { FileNode } from '../lib/virtual-fs';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface FileExplorerProps {
  nodes: FileNode[];
  activeFileId: string | null;
  getChildren: (parentId: string | null) => FileNode[];
  onOpenFile: (fileId: string) => void;
  onCreateFile: (name: string, parentId: string | null) => void;
  onCreateDirectory: (name: string, parentId: string | null) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string | null;
  nodeType: 'file' | 'directory' | null;
  parentId: string | null;
}

/* ------------------------------------------------------------------ */
/*  Inline name editor                                                */
/* ------------------------------------------------------------------ */

function InlineNameEditor({
  initial,
  onConfirm,
  onCancel,
}: {
  initial: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onConfirm(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') onCancel();
      }}
      className="text-[11px] bg-[var(--bg-input)] border border-blue-500 rounded px-1 py-0.5 outline-none w-full text-[var(--text-main)]"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  File tree node                                                    */
/* ------------------------------------------------------------------ */

function FileTreeNode({
  node,
  activeFileId,
  getChildren,
  onOpenFile,
  onContextMenu,
  renamingId,
  onRenameConfirm,
  onRenameCancel,
  depth = 0,
}: {
  node: FileNode;
  activeFileId: string | null;
  getChildren: (parentId: string | null) => FileNode[];
  onOpenFile: (fileId: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  renamingId: string | null;
  onRenameConfirm: (id: string, name: string) => void;
  onRenameCancel: () => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const isDir = node.type === 'directory';
  const isActive = node.id === activeFileId;
  const isRenaming = node.id === renamingId;
  const children = isDir ? getChildren(node.id) : [];

  const handleClick = () => {
    if (isDir) {
      setIsOpen(!isOpen);
    } else {
      onOpenFile(node.id);
    }
  };

  const Icon = isDir ? (isOpen ? FolderOpen : Folder) : FileCode;
  const iconColor = isDir ? 'text-amber-500' : 'text-blue-400';

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition-all group text-[11px]',
          isActive
            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : 'text-[var(--text-muted)] hover:bg-[var(--border-color)] hover:text-[var(--text-main)]',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {isDir ? (
          <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.1 }}>
            <ChevronRight size={12} className="text-[var(--text-muted)]" />
          </motion.div>
        ) : (
          <div className="w-3" />
        )}
        <Icon size={14} className={iconColor} />
        {isRenaming ? (
          <InlineNameEditor
            initial={node.name}
            onConfirm={(name) => onRenameConfirm(node.id, name)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="truncate flex-1">{node.name}</span>
        )}
      </div>
      {isDir && isOpen && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              activeFileId={activeFileId}
              getChildren={getChildren}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
              renamingId={renamingId}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Context menu                                                      */
/* ------------------------------------------------------------------ */

function FileContextMenu({
  state,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onNewFile: (parentId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const parentForNew = state.nodeType === 'directory' ? state.nodeId : state.parentId;

  interface ContextMenuItem {
    icon: typeof FilePlus;
    label: string;
    action: () => void;
    danger?: boolean;
  }

  const items: ContextMenuItem[] = [
    { icon: FilePlus, label: '新建文件', action: () => onNewFile(parentForNew) },
    { icon: FolderPlus, label: '新建文件夹', action: () => onNewFolder(parentForNew) },
    ...(state.nodeId
      ? [
          { icon: Pencil, label: '重命名', action: () => onRename(state.nodeId!) },
          { icon: Trash2, label: '删除', action: () => onDelete(state.nodeId!), danger: true },
        ]
      : []),
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[var(--bg-sidebar)] border border-[var(--border-color)] rounded-md shadow-xl py-1 min-w-[160px]"
      style={{ left: state.x, top: state.y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.action(); onClose(); }}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-1.5 text-[11px] transition-colors text-left',
            item.danger
              ? 'text-red-500 hover:bg-red-500/10'
              : 'text-[var(--text-main)] hover:bg-[var(--border-color)]',
          )}
        >
          <item.icon size={13} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pending node (new file/folder being named)                        */
/* ------------------------------------------------------------------ */

interface PendingNode {
  type: 'file' | 'directory';
  parentId: string | null;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export const FileExplorer: React.FC<FileExplorerProps> = ({
  nodes,
  activeFileId,
  getChildren,
  onOpenFile,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onDelete,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingNode | null>(null);

  const rootChildren = getChildren(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
      nodeType: node.type,
      parentId: node.parentId,
    });
  }, []);

  const handleBgContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: null,
      nodeType: null,
      parentId: null,
    });
  }, []);

  const handleNewFile = (parentId: string | null) => {
    setPending({ type: 'file', parentId });
  };

  const handleNewFolder = (parentId: string | null) => {
    setPending({ type: 'directory', parentId });
  };

  const handlePendingConfirm = (name: string) => {
    if (!pending) return;
    if (pending.type === 'file') {
      const fileName = name.endsWith('.sysml') ? name : `${name}.sysml`;
      onCreateFile(fileName, pending.parentId);
    } else {
      onCreateDirectory(name, pending.parentId);
    }
    setPending(null);
  };

  const handleRenameConfirm = (id: string, name: string) => {
    onRename(id, name);
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col h-full" onContextMenu={handleBgContextMenu}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] flex items-center justify-between">
        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">
          文件资源管理器
        </span>
        <div className="flex items-center gap-1">
          <button
            className="p-0.5 hover:bg-[var(--border-color)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            title="新建文件"
            onClick={() => handleNewFile(null)}
          >
            <FilePlus size={14} />
          </button>
          <button
            className="p-0.5 hover:bg-[var(--border-color)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            title="新建文件夹"
            onClick={() => handleNewFolder(null)}
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1.5 custom-scrollbar">
        {rootChildren.map((node) => (
          <FileTreeNode
            key={node.id}
            node={node}
            activeFileId={activeFileId}
            getChildren={getChildren}
            onOpenFile={onOpenFile}
            onContextMenu={handleContextMenu}
            renamingId={renamingId}
            onRenameConfirm={handleRenameConfirm}
            onRenameCancel={() => setRenamingId(null)}
          />
        ))}

        {/* Inline input for pending new node */}
        {pending && (
          <div className="flex items-center gap-1.5 py-1 px-1.5">
            <div className="w-3" />
            {pending.type === 'directory' ? (
              <Folder size={14} className="text-amber-500" />
            ) : (
              <FileCode size={14} className="text-blue-400" />
            )}
            <InlineNameEditor
              initial={pending.type === 'file' ? 'untitled.sysml' : 'new-folder'}
              onConfirm={handlePendingConfirm}
              onCancel={() => setPending(null)}
            />
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <FileContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={(id) => { setRenamingId(id); setContextMenu(null); }}
          onDelete={(id) => { onDelete(id); setContextMenu(null); }}
        />
      )}
    </div>
  );
};
