/**
 * EditorTabs — tab bar for open files.
 *
 * Displays one tab per open file. Supports:
 * - Click to switch active file
 * - Middle-click or ✕ button to close
 * - Dirty (modified) indicator dot
 */
import React from 'react';
import { X, FileCode } from 'lucide-react';
import { cn } from '../lib/utils';
import type { OpenTab } from '../hooks/useFileSystem';

interface EditorTabsProps {
  tabs: OpenTab[];
  activeFileId: string | null;
  getFileName: (fileId: string) => string;
  onSelect: (fileId: string) => void;
  onClose: (fileId: string) => void;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  tabs,
  activeFileId,
  getFileName,
  onSelect,
  onClose,
}) => {
  if (tabs.length === 0) return null;

  return (
    <div className="h-9 border-b border-[var(--border-color)] flex items-end bg-[var(--bg-sidebar)]/50 overflow-x-auto custom-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.fileId === activeFileId;
        const name = getFileName(tab.fileId);

        return (
          <div
            key={tab.fileId}
            className={cn(
              'group flex items-center gap-1.5 px-3 h-8 text-[11px] font-medium cursor-pointer transition-colors border-r border-[var(--border-color)] select-none shrink-0',
              isActive
                ? 'bg-[var(--bg-main)] text-[var(--text-main)] border-t-2 border-t-blue-500'
                : 'bg-[var(--bg-sidebar)] text-[var(--text-muted)] hover:bg-[var(--bg-main)]/50 border-t-2 border-t-transparent',
            )}
            onClick={() => onSelect(tab.fileId)}
            onMouseDown={(e) => {
              // Middle-click to close
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.fileId);
              }
            }}
          >
            <FileCode size={12} className={isActive ? 'text-blue-400' : 'text-[var(--text-muted)]'} />
            <span className="truncate max-w-[120px]">{name}</span>
            {tab.dirty && (
              <div className="w-2 h-2 rounded-full bg-amber-400" title="未保存的更改" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.fileId);
              }}
              className={cn(
                'p-0.5 rounded transition-colors',
                isActive
                  ? 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)]'
                  : 'text-transparent group-hover:text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)]',
              )}
              title="关闭"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
