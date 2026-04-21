import React from 'react';
import {
  Code,
  Save,
  Download,
  Play,
  History,
  Layers,
  Sparkles,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ToolbarProps {
  showCode: boolean;
  setShowCode: (show: boolean) => void;
  showAI: boolean;
  setShowAI: (show: boolean) => void;
}

export const Toolbar = ({
  showCode,
  setShowCode,
  showAI,
  setShowAI,
}: ToolbarProps) => {
  return (
    <div className="h-9 border-b border-[var(--border-color)] flex items-center justify-between px-3 bg-[var(--bg-sidebar)]/50 backdrop-blur-sm transition-colors duration-200 flex-shrink-0">
      {/* Left: view toggles + actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowCode(!showCode)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded transition-colors',
            showCode
              ? 'text-blue-500 bg-blue-500/10'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)]',
          )}
          title="切换 SysML 代码编辑器"
        >
          <Code size={13} />
          {showCode ? '隐藏代码' : '显示代码'}
        </button>
        <button
          onClick={() => setShowAI(!showAI)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded transition-colors',
            showAI
              ? 'text-purple-500 bg-purple-500/10'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)]',
          )}
          title="AI 助手"
        >
          <Sparkles size={13} />
          {showAI ? '隐藏 AI' : 'AI 助手'}
        </button>

        <div className="h-4 w-px bg-[var(--border-color)] mx-1" />

        <button className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)] rounded transition-colors">
          <Save size={13} />
          保存
        </button>
        <button className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)] rounded transition-colors">
          <Download size={13} />
          导出
        </button>
        <button className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-blue-500 hover:bg-blue-500/10 rounded transition-colors">
          <Play size={13} />
          运行仿真
        </button>

        <div className="h-4 w-px bg-[var(--border-color)] mx-1" />

        <div className="flex items-center gap-0.5 text-[var(--text-muted)]">
          <button className="p-1 hover:text-[var(--text-main)] hover:bg-[var(--border-color)] rounded transition-colors" title="撤销 (Ctrl+Z)">
            <Undo2 size={13} />
          </button>
          <button className="p-1 hover:text-[var(--text-main)] hover:bg-[var(--border-color)] rounded transition-colors" title="重做 (Ctrl+Y)">
            <Redo2 size={13} />
          </button>
        </div>
      </div>

      {/* Right: current diagram label */}
      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] bg-[var(--bg-main)] px-2 py-1 rounded border border-[var(--border-color)] flex-shrink-0">
        <Layers size={11} />
        <span>BDD: 系统层级结构图</span>
      </div>
    </div>
  );
};
