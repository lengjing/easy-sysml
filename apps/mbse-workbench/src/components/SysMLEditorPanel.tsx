import React from 'react';
import { Code, CheckCircle2 } from 'lucide-react';
import { SysMLEditor } from './editor/SysMLEditor';
import type { DocumentSymbol } from 'vscode-languageserver-protocol';

interface SysMLEditorPanelProps {
  code: string;
  setCode: (code: string) => void;
  onDocumentSymbols?: (symbols: DocumentSymbol[]) => void;
}

export const SysMLEditorPanel = ({
  code,
  setCode,
  onDocumentSymbols,
}: SysMLEditorPanelProps) => {
  return (
    <div className="w-1/2 border-l border-[var(--border-color)] bg-[var(--bg-sidebar)] flex flex-col transition-all duration-300">
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
      <div className="flex-1 relative overflow-hidden">
        <SysMLEditor
          value={code}
          onChange={setCode}
          onDocumentSymbols={onDocumentSymbols}
        />
      </div>
    </div>
  );
};
