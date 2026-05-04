/**
 * FileExplorer — VS Code-style file tree with CRUD + drag & drop.
 *
 * Renders a recursive tree of the virtual file system. Supports:
 * - Single click to preview a file (shown in editor, not pinned to tab)
 * - Double click to open/pin a file as a persistent tab
 * - Drag & drop to move files and folders
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
  previewFileId?: string | null;
  getChildren: (parentId: string | null) => FileNode[];
  onOpenFile: (fileId: string) => void;
  onPreviewFile?: (fileId: string) => void;
  onCreateFile: (name: string, parentId: string | null) => void;
  onCreateDirectory: (name: string, parentId: string | null) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onMoveNode?: (id: string, newParentId: string | null) => void;
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
  previewFileId,
  getChildren,
  onOpenFile,
  onPreviewFile,
  onContextMenu,
  onMoveNode,
  renamingId,
  onRenameConfirm,
  onRenameCancel,
  depth = 0,
}: {
  node: FileNode;
  activeFileId: string | null;
  previewFileId?: string | null;
  getChildren: (parentId: string | null) => FileNode[];
  onOpenFile: (fileId: string) => void;
  onPreviewFile?: (fileId: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onMoveNode?: (id: string, newParentId: string | null) => void;
  renamingId: string | null;
  onRenameConfirm: (id: string, name: string) => void;
  onRenameCancel: () => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const isDir = node.type === 'directory';
  const isActive = node.id === activeFileId;
  const isPreview = !isActive && node.id === previewFileId;
  const isRenaming = node.id === renamingId;
  const children = isDir ? getChildren(node.id) : [];

  /* -- Click handlers -- */
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDir) {
      setIsOpen(o => !o);
    } else if (onPreviewFile) {
      onPreviewFile(node.id);
    } else {
      onOpenFile(node.id);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDir) {
      onOpenFile(node.id);
    }
  };

  /* -- Drag & drop handlers -- */
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== node.id) {
      onMoveNode?.(draggedId, node.id);
    }
  };

  const Icon = isDir ? (isOpen ? FolderOpen : Folder) : FileCode;
  const iconColor = isDir ? 'text-amber-500' : 'text-blue-400';

  return (
    <div>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={isDir ? handleDragOver : undefined}
        onDragLeave={isDir ? handleDragLeave : undefined}
        onDrop={isDir ? handleDrop : undefined}
        className={cn(
          'flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition-all group text-[11px]',
          isActive
            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : isPreview
            ? 'bg-blue-500/8 text-[var(--text-main)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--border-color)] hover:text-[var(--text-main)]',
          isDragOver && 'bg-blue-500/15 border border-blue-500/30',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
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
          <span className={cn('truncate flex-1', isPreview && !isActive && 'italic')}>{node.name}</span>
        )}
      </div>
      {isDir && isOpen && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              activeFileId={activeFileId}
              previewFileId={previewFileId}
              getChildren={getChildren}
              onOpenFile={onOpenFile}
              onPreviewFile={onPreviewFile}
              onContextMenu={onContextMenu}
              onMoveNode={onMoveNode}
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
  previewFileId,
  getChildren,
  onOpenFile,
  onPreviewFile,
  onCreateFile,
  onCreateDirectory,
  onRename,
  onDelete,
  onMoveNode,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingNode | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);

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

  /* -- Root-level drop (move to project root) -- */
  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setRootDragOver(true);
  };

  const handleRootDragLeave = () => setRootDragOver(false);

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setRootDragOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId) {
      onMoveNode?.(draggedId, null);
    }
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
      <div
        className={cn(
          'flex-1 overflow-y-auto p-1.5 custom-scrollbar',
          rootDragOver && 'bg-blue-500/5',
        )}
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        {rootChildren.map((node) => (
          <FileTreeNode
            key={node.id}
            node={node}
            activeFileId={activeFileId}
            previewFileId={previewFileId}
            getChildren={getChildren}
            onOpenFile={onOpenFile}
            onPreviewFile={onPreviewFile}
            onContextMenu={handleContextMenu}
            onMoveNode={onMoveNode}
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
