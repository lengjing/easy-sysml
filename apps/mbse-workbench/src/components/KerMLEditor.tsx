import React from 'react';
import { Code, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { SysMLEditor } from '../editor/SysMLEditor';

interface KerMLEditorProps {
  kermlCode: string;
  setKermlCode: (code: string) => void;
  parseError: string | null;
  syncCodeFromCanvas: () => void;
}

export const KerMLEditor = ({
  kermlCode,
  setKermlCode,
  parseError,
  syncCodeFromCanvas
}: KerMLEditorProps) => {
  return (
    <div className="w-1/2 border-l border-[var(--border-color)] bg-[var(--bg-sidebar)] flex flex-col transition-all duration-300">
      <div className="h-10 border-b border-[var(--border-color)] flex items-center justify-between px-3 bg-[var(--bg-header)]/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Code size={14} className="text-blue-500" />
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">KerML 文本编辑器</span>
          </div>
          {parseError ? (
            <div className="flex items-center gap-1 text-[9px] text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
              <AlertTriangle size={10} />
              解析错误
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[9px] text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
              <CheckCircle2 size={10} />
              已同步
            </div>
          )}
        </div>
        <button 
          onClick={syncCodeFromCanvas}
          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-blue-500 hover:bg-blue-500/10 rounded transition-colors"
          title="从画布同步代码"
        >
          <RefreshCw size={12} />
          从画布同步
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <SysMLEditor
          value={kermlCode}
          onChange={setKermlCode}
        />
      </div>
    </div>
  );
};
