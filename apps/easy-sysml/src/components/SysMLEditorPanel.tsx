import React from 'react';
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
  /** Preview file id (shown as italic tab). */
  previewFileId?: string | null;
  /** Called when user clicks preview tab. */
  onSelectPreview?: () => void;
  /** Called when user closes preview tab. */
  onClosePreview?: () => void;
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
  previewFileId,
  onSelectPreview,
  onClosePreview,
}: SysMLEditorPanelProps) => {
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
      {/* Tab bar — always show when panel is visible */}
      {onSelectTab && onCloseTab && getFileName && (
        <EditorTabs
          tabs={openTabs ?? []}
          activeFileId={activeFileId ?? null}
          getFileName={getFileName}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          previewFileId={previewFileId}
          onSelectPreview={onSelectPreview}
          onClosePreview={onClosePreview}
        />
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
