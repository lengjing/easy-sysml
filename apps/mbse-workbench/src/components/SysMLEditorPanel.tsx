import React from 'react';
import { Code, CheckCircle2 } from 'lucide-react';
import { SysMLEditor } from './editor/SysMLEditor';
import { EditorTabs } from './EditorTabs';
import type { DocumentSymbol } from 'vscode-languageserver-protocol';
import type { OpenTab } from '../hooks/useFileSystem';

interface SysMLEditorPanelProps {
  code: string;
  setCode: (code: string) => void;
  onDocumentSymbols?: (symbols: DocumentSymbol[]) => void;
  /** When false the panel is kept mounted (preserving undo history) but hidden. */
  visible?: boolean;
  /** Open tabs for the multi-file tab bar. */
  openTabs?: OpenTab[];
  /** Active file id. */
  activeFileId?: string | null;
  /** Callback to switch active tab. */
  onSelectTab?: (fileId: string) => void;
  /** Callback to close a tab. */
  onCloseTab?: (fileId: string) => void;
  /** Get file name for a tab. */
  getFileName?: (fileId: string) => string;
  /** Current file URI for LSP. */
  fileUri?: string;
}

export const SysMLEditorPanel = ({
  code,
  setCode,
  onDocumentSymbols,
  visible = true,
  openTabs,
  activeFileId,
  onSelectTab,
  onCloseTab,
  getFileName,
  fileUri,
}: SysMLEditorPanelProps) => {
  const hasTabs = openTabs && openTabs.length > 0;

  // Always render the same tree so the Monaco editor instance (and its undo
  // stack) survives hide/show toggles.  When hidden, move off-screen with
  // zero dimensions so it doesn't affect layout.
  return (
    <div
      className={
        visible
          ? 'w-1/2 border-l border-[var(--border-color)] bg-[var(--bg-sidebar)] flex flex-col transition-all duration-300'
          : 'absolute -left-[9999px] w-0 h-0 overflow-hidden pointer-events-none'
      }
      aria-hidden={!visible}
    >
      {/* Tab bar */}
      {hasTabs && onSelectTab && onCloseTab && getFileName ? (
        <EditorTabs
          tabs={openTabs}
          activeFileId={activeFileId ?? null}
          getFileName={getFileName}
          onSelect={onSelectTab}
          onClose={onCloseTab}
        />
      ) : (
        <div className="h-10 border-b border-[var(--border-color)] flex items-center justify-between px-3 bg-[var(--bg-header)]/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Code size={14} className="text-blue-500" />
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">SysML v2 编辑器</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
              <CheckCircle2 size={10} />
              LSP 已连接
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 relative overflow-hidden">
        <SysMLEditor
          value={code}
          onChange={setCode}
          onDocumentSymbols={onDocumentSymbols}
          fileUri={fileUri}
        />
      </div>
    </div>
  );
};
